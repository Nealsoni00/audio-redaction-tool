# Audio Redaction Tool - Remaining Implementation Plan

## ✅ COMPLETED (Current Session)

1. **Fixed Audio File Switching** - AudioEditor now properly destroys and recreates WaveSurfer when switching between timeline items
2. **Implemented Tone/Silence Playback** - Redacted sections now play silence or tone instead of skipping
3. **Added RedactionMode Type System** - `'tone' | 'silence'` with global default and per-clip overrides
4. **Added Visual Indicators** - Orange for tone, red for silence in waveform
5. **Improved AbortError Handling** - Added pause before destroy to reduce errors

## 🚧 CRITICAL ISSUES TO FIX

### Issue #1: Timeline Zoom Causing Playback Desync ⚠️
**Problem**: When zooming timeline (Cmd+Scroll or buttons), the playhead visual stops moving but audio continues playing.

**Root Cause**: The zoom changes the `zoom` state which triggers a re-render. The playhead position calculation depends on `zoom`, so when zoom changes mid-playback, the playhead calculation becomes incorrect.

**Solution**:
```typescript
// In Timeline.tsx, the playhead position calculation (around line 396):
const playheadPosition = (playbackState.currentTime * zoom);

// This needs to be stable during playback. Options:
// Option A: Pause playback when zooming
// Option B: Use a ref to track zoom during playback
// Option C: Recalculate playhead on every animation frame
```

**Recommended Fix**:
```typescript
// Add useEffect to pause when zooming
useEffect(() => {
  if (playbackState.isPlaying && wavesurferInstance) {
    // Force playhead to update after zoom change
    const currentTime = playbackState.currentTime;
    setPlaybackState({ currentTime });
  }
}, [zoom]);
```

---

### Issue #2: Timeline Standalone Playback 🎵
**Problem**: Timeline play button currently just plays the individual WaveSurfer file (if one is selected). It should play ALL timeline items mixed together.

**Required Architecture**:

1. **Create Timeline Audio Manager** (`lib/timelineAudioManager.ts`):
```typescript
export class TimelineAudioManager {
  private audioContext: AudioContext;
  private audioBuffers: Map<string, AudioBuffer> = new Map();
  private sourceNodes: AudioBufferSourceNode[] = [];
  private gainNodes: Map<string, GainNode> = new Map();

  constructor() {
    this.audioContext = new AudioContext();
  }

  async loadTimelineItems(timelineItems: TimelineItem[], mediaFiles: MediaFile[]) {
    // Load all audio files into buffers
    for (const item of timelineItems) {
      const mediaFile = mediaFiles.find(m => m.id === item.mediaId);
      if (!mediaFile) continue;

      const arrayBuffer = await mediaFile.file.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      this.audioBuffers.set(item.id, audioBuffer);
    }
  }

  play(timelineItems: TimelineItem[], startTime: number = 0) {
    // For each timeline item:
    for (const item of timelineItems) {
      const buffer = this.audioBuffers.get(item.id);
      if (!buffer) continue;

      // Create source node
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;

      // Create gain node for muting
      const gainNode = this.audioContext.createGain();
      this.gainNodes.set(item.id, gainNode);

      // Connect: source -> gain -> destination
      source.connect(gainNode);
      gainNode.connect(this.audioContext.destination);

      // Schedule playback at correct timeline position
      const timelineStartTime = item.startTime;
      const audioStartTime = this.audioContext.currentTime + (timelineStartTime - startTime);

      source.start(audioStartTime, startTime - timelineStartTime);
      this.sourceNodes.push(source);

      // Handle muted clips - need to automate gain changes
      this.scheduleMutedRegions(item, gainNode, audioStartTime);
    }
  }

  private scheduleMutedRegions(item: TimelineItem, gainNode: GainNode, startTime: number) {
    // For each muted clip, schedule gain automation
    for (const clip of item.clips) {
      if (!clip.muted) continue;

      const clipStartTime = startTime + clip.startTime;
      const clipEndTime = startTime + clip.endTime;

      // Mute at clip start
      gainNode.gain.setValueAtTime(0, clipStartTime);

      // Unmute at clip end
      gainNode.gain.setValueAtTime(1, clipEndTime);

      // If tone mode, play oscillator
      const mode = clip.redactionMode || globalRedactionMode;
      if (mode === 'tone') {
        const osc = this.audioContext.createOscillator();
        osc.frequency.value = 1000;
        const oscGain = this.audioContext.createGain();
        oscGain.gain.value = 0.3;
        osc.connect(oscGain);
        oscGain.connect(this.audioContext.destination);
        osc.start(clipStartTime);
        osc.stop(clipEndTime);
      }
    }
  }

  pause() {
    // Stop all source nodes
    for (const source of this.sourceNodes) {
      source.stop();
    }
    this.sourceNodes = [];
  }

  seek(time: number) {
    // Stop current playback and restart from new time
    this.pause();
    this.play(timelineItems, time);
  }
}
```

2. **Integrate into Timeline Component**:
```typescript
// In Timeline.tsx:
const audioManagerRef = useRef<TimelineAudioManager | null>(null);

useEffect(() => {
  audioManagerRef.current = new TimelineAudioManager();
  return () => {
    audioManagerRef.current?.pause();
  };
}, []);

const togglePlayback = () => {
  if (!audioManagerRef.current) return;

  if (playbackState.isPlaying) {
    audioManagerRef.current.pause();
    setPlaybackState({ isPlaying: false });
  } else {
    // Load timeline items into manager
    await audioManagerRef.current.loadTimelineItems(timelineItems, mediaFiles);
    audioManagerRef.current.play(timelineItems, playbackState.currentTime);
    setPlaybackState({ isPlaying: true });

    // Start animation loop to update currentTime
    startPlaybackLoop();
  }
};

const startPlaybackLoop = () => {
  const startTime = performance.now();
  const startPosition = playbackState.currentTime;

  const loop = () => {
    if (!playbackState.isPlaying) return;

    const elapsed = (performance.now() - startTime) / 1000;
    const newTime = startPosition + elapsed;

    if (newTime >= playbackState.duration) {
      setPlaybackState({ isPlaying: false, currentTime: playbackState.duration });
      return;
    }

    setPlaybackState({ currentTime: newTime });
    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
};
```

---

## 🎨 UI ELEMENTS TO ADD

### 1. Global Redaction Mode Toggle
**Location**: Timeline header, next to Export button

```typescript
// Add to Timeline.tsx imports:
import { Volume2, VolumeX } from 'lucide-react';

// Add to Timeline.tsx store destructuring:
const { globalRedactionMode, setGlobalRedactionMode } = useStore();

// Add to Timeline controls (after Export button):
<Button
  variant="outline"
  size="sm"
  onClick={() => setGlobalRedactionMode(
    globalRedactionMode === 'tone' ? 'silence' : 'tone'
  )}
  className="ml-2"
>
  {globalRedactionMode === 'tone' ? (
    <>
      <Volume2 className="mr-2 h-4 w-4" />
      Tone on Redactions
    </>
  ) : (
    <>
      <VolumeX className="mr-2 h-4 w-4" />
      Silence on Redactions
    </>
  )}
</Button>
```

### 2. Per-Clip Redaction Controls in AudioEditor
**Location**: AudioEditor controls panel

```typescript
// Add to AudioEditor.tsx:
{mutedCount > 0 && (
  <div className="mt-3 p-3 border rounded-lg bg-muted/50">
    <div className="text-sm font-medium mb-2">Redacted Regions ({mutedCount})</div>
    <div className="text-xs text-muted-foreground mb-2">
      Click on a red region in the waveform to select it
    </div>

    {selectedClip && (
      <div className="flex items-center gap-2 p-2 bg-background rounded">
        <div className="flex-1">
          <div className="text-xs font-medium">
            {formatTime(selectedClip.startTime)} - {formatTime(selectedClip.endTime)}
          </div>
          <div className="text-xs text-muted-foreground">
            Mode: {(selectedClip.redactionMode || globalRedactionMode) === 'tone' ? 'Tone' : 'Silence'}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleToggleClipRedactionMode(selectedClip.id)}
        >
          {(selectedClip.redactionMode || globalRedactionMode) === 'tone' ? (
            <>
              <VolumeX className="mr-2 h-3 w-3" />
              Use Silence
            </>
          ) : (
            <>
              <Volume2 className="mr-2 h-3 w-3" />
              Use Tone
            </>
          )}
        </Button>
      </div>
    )}
  </div>
)}
```

### 3. Add Waveform Click Handler
```typescript
// In AudioEditor, update waveform container:
<div
  ref={waveformContainerRef}
  className="p-4 flex-shrink-0 overflow-x-auto overflow-y-hidden max-w-full cursor-pointer"
  onWheel={handleWaveformWheel}
  onClick={handleWaveformClick}  // ADD THIS
  style={{ width: '100%' }}
>
```

### 4. Update Timeline Redaction Indicators
**Location**: Timeline.tsx, around line 470 (REDACTED overlay rendering)

```typescript
// Update the redacted region rendering to show different colors:
const mode = clip.redactionMode || globalRedactionMode;
const bgColor = mode === 'tone' ? 'bg-orange-500/30' : 'bg-red-500/30';
const borderColor = mode === 'tone' ? 'border-orange-500' : 'border-red-500';
const textColor = mode === 'tone' ? 'text-orange-500' : 'text-red-500';

<div
  className={`absolute top-0 bottom-0 ${bgColor} ${borderColor} border-l-2 border-r-2 pointer-events-none z-10`}
  style={{
    left: `${clipLeftPx}px`,
    width: `${clipWidthPx}px`,
  }}
>
  <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 ${textColor} text-xs font-bold opacity-70 flex items-center gap-1`}>
    {mode === 'tone' && <Volume2 className="h-3 w-3" />}
    {mode === 'silence' && <VolumeX className="h-3 w-3" />}
    REDACTED
  </div>
</div>
```

---

## 📝 TESTING CHECKLIST

Once all above is implemented:

- [ ] Timeline zoom doesn't desync playback
- [ ] Timeline play button plays all tracks mixed
- [ ] Timeline play respects muted regions (silence/tone)
- [ ] Individual AudioEditor playback still works
- [ ] Switching between files doesn't cause errors
- [ ] Global redaction mode toggle works
- [ ] Per-clip redaction mode toggle works
- [ ] Visual indicators show correct colors
- [ ] Export includes all tracks mixed correctly
- [ ] No console errors

---

## 🎯 PRIORITY ORDER

1. **CRITICAL**: Fix timeline zoom playback desync
2. **HIGH**: Implement timeline standalone playback with mixer
3. **MEDIUM**: Add global redaction mode toggle UI
4. **MEDIUM**: Add per-clip redaction controls UI
5. **LOW**: Update timeline visual indicators with icons

---

## 💡 NOTES

- The timeline audio mixer is the most complex feature
- May want to create a separate audio engine module
- Consider using Tone.js library for easier audio scheduling
- Test with multiple overlapping audio files
- Test with files of different sample rates/channels

