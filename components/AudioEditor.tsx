'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { TimelineItem } from '@/lib/types';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions';
import { Button } from '@/components/ui/button';
import { Play, Pause, Trash2, ZoomIn, ZoomOut, Volume2, VolumeX } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { TranscriptView } from './TranscriptView';
import { v4 as uuidv4 } from 'uuid';

interface AudioEditorProps {
  timelineItemId: string;
}

export function AudioEditor({ timelineItemId }: AudioEditorProps) {
  const {
    timelineItems,
    mediaFiles,
    removeClip,
    addClip,
    updateClip,
    setPlaybackState,
    playbackState,
    setWavesurferInstance,
    globalRedactionMode,
  } = useStore();

  const waveformRef = useRef<HTMLDivElement>(null);
  const waveformContainerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [selectedRegion, setSelectedRegion] = useState<{ start: number; end: number } | null>(null);
  const [waveformZoom, setWaveformZoom] = useState(50); // pixels per second for waveform
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const isZoomingRef = useRef(false);
  const zoomTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSyncingTimeRef = useRef(false); // Prevent circular time updates
  const timelineItemRef = useRef<TimelineItem | undefined>(undefined); // Keep latest timeline item

  const timelineItem = timelineItems.find((item) => item.id === timelineItemId);
  const mediaFile = timelineItem ? mediaFiles.find((m) => m.id === timelineItem.mediaId) : null;
  const selectedClip = selectedClipId ? timelineItem?.clips.find((c) => c.id === selectedClipId) : null;
  
  // Update ref whenever timelineItem changes
  useEffect(() => {
    timelineItemRef.current = timelineItem;
  }, [timelineItem]);

  useEffect(() => {
    if (!waveformRef.current || !mediaFile) return;

    // Create WaveSurfer instance with initial zoom
    const wavesurfer = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: '#9333ea',
      progressColor: '#7c3aed',
      cursorColor: '#7c3aed',
      barWidth: 2,
      barGap: 1,
      height: 128,
      normalize: true,
      backend: 'WebAudio',
      minPxPerSec: waveformZoom,
    });

    // Add regions plugin
    const regions = wavesurfer.registerPlugin(RegionsPlugin.create());
    regionsRef.current = regions;

    // Load audio
    const url = URL.createObjectURL(mediaFile.file);
    wavesurfer.load(url);

    wavesurfer.on('ready', () => {
      setIsReady(true);
      renderClips();
      setWavesurferInstance(wavesurfer);
    });

    wavesurfer.on('play', () => {
      setPlaybackState({ isPlaying: true });

      // When resuming playback, immediately check if we're in a muted region
      // Use ref to get latest timelineItem data
      const currentTime = wavesurfer.getCurrentTime();
      const mutedClip = timelineItemRef.current?.clips.find(
        (clip) => clip.muted && currentTime >= clip.startTime && currentTime < clip.endTime
      );

      if (mutedClip) {
        // We're starting in a muted region - handle it immediately
        const mode = mutedClip.redactionMode || globalRedactionMode;
        
        if (mode === 'tone') {
          // Set volume to 0 and prepare tone
          try {
            wavesurfer.setVolume(0);
          } catch (e) {
            wavesurfer.setMuted(true);
          }
          
          if (!audioContextRef.current) {
            audioContextRef.current = new AudioContext();
          }
          if (!oscillatorRef.current) {
            try {
              oscillatorRef.current = audioContextRef.current.createOscillator();
              gainNodeRef.current = audioContextRef.current.createGain();
              oscillatorRef.current.type = 'sine';
              oscillatorRef.current.frequency.value = 1000;
              oscillatorRef.current.connect(gainNodeRef.current!);
              gainNodeRef.current!.connect(audioContextRef.current.destination);
              gainNodeRef.current!.gain.value = 0.3;
              oscillatorRef.current.start();
            } catch (e) {
              console.warn('Failed to start oscillator:', e);
            }
          }
        } else {
          // Silence mode - set volume to 0
          try {
            wavesurfer.setVolume(0);
          } catch (e) {
            wavesurfer.setMuted(true);
          }
        }
      } else {
        // Not in a muted region - restore volume
        try {
          wavesurfer.setVolume(1);
          if (wavesurfer.getMuted()) {
            wavesurfer.setMuted(false);
          }
        } catch (e) {
          if (wavesurfer.getMuted()) {
            wavesurfer.setMuted(false);
          }
        }
      }
    });

    wavesurfer.on('pause', () => {
      setPlaybackState({ isPlaying: false });

      // Restore volume and unmute when pausing to prevent stuck state
      try {
        wavesurfer.setVolume(1);
        if (wavesurfer.getMuted()) {
          wavesurfer.setMuted(false);
        }
      } catch (e) {
        if (wavesurfer.getMuted()) {
          wavesurfer.setMuted(false);
        }
      }

      // Stop tone if playing
      if (oscillatorRef.current) {
        try {
          oscillatorRef.current.stop();
          oscillatorRef.current.disconnect();
        } catch (e) {
          // Ignore if already stopped
        }
        oscillatorRef.current = null;
      }
    });

    wavesurfer.on('timeupdate', (currentTime) => {
      // Use ref to get latest timelineItem data
      const currentTimelineItem = timelineItemRef.current;
      
      // Update global playback time to reflect position on master timeline
      // Individual file's currentTime + timeline item's start position = master timeline position
      const masterTimelinePosition = currentTimelineItem ? currentTimelineItem.startTime + currentTime : currentTime;
      
      // Only update state if we're not currently syncing (prevent circular updates)
      if (!isSyncingTimeRef.current) {
        setPlaybackState({ currentTime: masterTimelinePosition });
      }

      // Handle muted/redacted regions during playback (mute audio or play tone, don't skip)
      if (currentTimelineItem && wavesurfer.isPlaying()) {
        const mutedClip = currentTimelineItem.clips.find(
          (clip) => clip.muted && currentTime >= clip.startTime && currentTime < clip.endTime
        );

        if (mutedClip) {
          // Determine if this clip should play a tone or be silent
          const mode = mutedClip.redactionMode || globalRedactionMode;

          if (mode === 'tone') {
            // Play tone - set volume to 0 instead of muting (mute can cause issues)
            try {
              wavesurfer.setVolume(0);
            } catch (e) {
              // Fallback to mute if setVolume fails
              wavesurfer.setMuted(true);
            }
            
            if (!oscillatorRef.current || !audioContextRef.current) {
              try {
                // Initialize audio context and oscillator
                audioContextRef.current = new AudioContext();
                oscillatorRef.current = audioContextRef.current.createOscillator();
                gainNodeRef.current = audioContextRef.current.createGain();

                oscillatorRef.current.type = 'sine';
                oscillatorRef.current.frequency.value = 1000; // 1kHz beep
                oscillatorRef.current.connect(gainNodeRef.current);
                gainNodeRef.current.connect(audioContextRef.current.destination);
                gainNodeRef.current.gain.value = 0.3; // 30% volume
                oscillatorRef.current.start();
              } catch (e) {
                console.warn('Failed to create oscillator:', e);
              }
            }
          } else {
            // Silence mode - set volume to 0 instead of muting
            try {
              wavesurfer.setVolume(0);
            } catch (e) {
              wavesurfer.setMuted(true);
            }
            
            // Stop tone if it's playing
            if (oscillatorRef.current) {
              try {
                oscillatorRef.current.stop();
                oscillatorRef.current.disconnect();
              } catch (e) {
                // Ignore if already stopped
              }
              oscillatorRef.current = null;
            }
          }
        } else {
          // Not in a muted region - restore volume and stop tone
          try {
            wavesurfer.setVolume(1);
            if (wavesurfer.getMuted()) {
              wavesurfer.setMuted(false);
            }
          } catch (e) {
            if (wavesurfer.getMuted()) {
              wavesurfer.setMuted(false);
            }
          }
          
          if (oscillatorRef.current) {
            try {
              oscillatorRef.current.stop();
              oscillatorRef.current.disconnect();
            } catch (e) {
              // Ignore if already stopped
            }
            oscillatorRef.current = null;
          }
        }
      }
    });

    // Enable region drawing with drag and resize enabled
    regions.enableDragSelection({
      color: 'rgba(124, 58, 237, 0.3)',
      drag: true,
      resize: true,
    });

    // Listen for region creation
    regions.on('region-created', (region) => {
      // Clear any existing purple selection regions before setting the new one
      regions.getRegions().forEach((r) => {
        if (r !== region) {
          const color = r.color || '';
          // Remove purple selection regions (not red/orange muted regions)
          if (color.includes('124, 58, 237')) {
            r.remove();
          }
        }
      });
      
      setSelectedRegion({ start: region.start, end: region.end });
    });

    // Listen for region updates (drag and resize)
    regions.on('region-updated', (region) => {
      const color = region.color || '';
      
      // Check if this is a muted region (red/orange) or selection region (purple)
      if (region.id && (color.includes('239, 68, 68') || color.includes('255, 165, 0'))) {
        // This is a muted region - update the clip boundaries
        const clipId = region.id;
        updateClip(timelineItemId, clipId, {
          startTime: region.start,
          endTime: region.end,
        });
      } else if (color.includes('124, 58, 237')) {
        // This is a selection region (purple)
        setSelectedRegion({ start: region.start, end: region.end });
      }
    });

    // Listen for region clicks to select muted clips
    regions.on('region-clicked', (region, e) => {
      const color = region.color || '';
      
      // If clicking a muted region, select it for editing
      if (region.id && (color.includes('239, 68, 68') || color.includes('255, 165, 0'))) {
        e.stopPropagation();
        setSelectedRegion(null);
        setSelectedClipId(region.id);
        // Remove any purple selection regions
        regions.getRegions().forEach((r) => {
          const rColor = r.color || '';
          if (rColor.includes('124, 58, 237')) {
            r.remove();
          }
        });
      }
    });

    wavesurferRef.current = wavesurfer;

    return () => {
      // WaveSurfer cleanup - suppress AbortError globally
      const originalError = console.error;
      const errorHandler = (event: ErrorEvent) => {
        if (event.error?.name === 'AbortError' || event.message?.includes('AbortError')) {
          event.preventDefault();
          event.stopPropagation();
          return true;
        }
      };

      window.addEventListener('error', errorHandler);
      console.error = (...args) => {
        if (args[0]?.toString().includes('AbortError')) return;
        originalError(...args);
      };

      // Stop oscillator if playing
      if (oscillatorRef.current) {
        try {
          oscillatorRef.current.stop();
          oscillatorRef.current.disconnect();
        } catch (e) {
          // Ignore if already stopped
        }
        oscillatorRef.current = null;
      }

      // Close audio context
      if (audioContextRef.current) {
        try {
          audioContextRef.current.close();
        } catch (e) {
          // Ignore errors
        }
        audioContextRef.current = null;
      }

      try {
        // Pause before destroying to avoid AbortError
        if (wavesurfer.isPlaying()) {
          wavesurfer.pause();
        }
        // Small delay to let any pending operations complete
        setTimeout(() => {
          try {
            wavesurfer.destroy();
          } catch (e) {
            // Silently ignore
          }
        }, 50);
      } catch (error) {
        // Silently ignore all cleanup errors
      }

      console.error = originalError;
      window.removeEventListener('error', errorHandler);

      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        // Ignore URL cleanup errors
      }
    };
  }, [mediaFile, timelineItemId]); // Removed waveformZoom - zoom is handled separately

  // Render clips as regions - only show muted regions as overlays
  const renderClips = useCallback(() => {
    if (!regionsRef.current || !timelineItem) return;

    try {
      regionsRef.current.clearRegions();

      // Only render muted clips as red overlays, different colors for tone vs silence
      timelineItem.clips.forEach((clip) => {
        if (clip.muted) {
          const mode = clip.redactionMode || globalRedactionMode;
          // Tone: more orange/yellow tint, Silence: pure red
          const color = mode === 'tone' ? 'rgba(255, 165, 0, 0.4)' : 'rgba(239, 68, 68, 0.3)';
          const region = regionsRef.current?.addRegion({
            start: clip.startTime,
            end: clip.endTime,
            color,
            drag: true,
            resize: true,
            id: clip.id, // Store clip ID for updates
          });
          
          // Make muted regions draggable with visual feedback
          if (region && region.element) {
            region.element.style.cursor = 'move';
            region.element.title = 'Drag to move or resize this redacted section';
          }
        }
      });
    } catch (error) {
      // Ignore region errors if WaveSurfer not fully initialized
    }
  }, [timelineItem, globalRedactionMode]);

  // Handle zoom changes dynamically without recreating the instance
  useEffect(() => {
    if (wavesurferRef.current && isReady) {
      try {
        // Set zooming flag to prevent region flicker
        isZoomingRef.current = true;
        
        // Clear any pending zoom timeout
        if (zoomTimeoutRef.current) {
          clearTimeout(zoomTimeoutRef.current);
        }
        
        // Use requestAnimationFrame to batch zoom updates and reduce errors
        requestAnimationFrame(() => {
          if (wavesurferRef.current) {
            try {
              // Check if audio is loaded before zooming
              const duration = wavesurferRef.current.getDuration();
              if (duration > 0) {
                wavesurferRef.current.zoom(waveformZoom);
              }
            } catch (e) {
              // Silently ignore if audio not yet loaded
            }
          }
        });
        
        // Reset zooming flag after a short delay to allow zoom to settle
        zoomTimeoutRef.current = setTimeout(() => {
          isZoomingRef.current = false;
          // Re-render regions after zoom completes
          renderClips();
        }, 150);
      } catch (error) {
        // Silently ignore zoom errors (AbortError during rapid zoom changes)
        if (error instanceof Error && error.name !== 'AbortError') {
          console.warn('Zoom error:', error);
        }
      }
    }
    
    return () => {
      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current);
      }
    };
  }, [waveformZoom, isReady, renderClips]);

  useEffect(() => {
    // Skip rendering regions while actively zooming to prevent flicker
    if (isReady && !isZoomingRef.current) {
      renderClips();
    }
  }, [timelineItem?.clips, isReady, globalRedactionMode, renderClips]);
  
  // Also re-render when the clips array reference changes (after muting/unmuting)
  useEffect(() => {
    if (isReady && timelineItem) {
      renderClips();
    }
  }, [timelineItem?.clips?.length, isReady, timelineItem, renderClips]);

  // Sync playback state - handle play/pause (only when wavesurfer is ready)
  useEffect(() => {
    if (!wavesurferRef.current || !isReady) return;

    if (playbackState.isPlaying) {
      wavesurferRef.current.play();
    } else {
      wavesurferRef.current.pause();
    }
  }, [playbackState.isPlaying, isReady]);

  // Sync playback position - convert master timeline position to local file position
  // Only sync when NOT playing to avoid interfering with normal playback
  useEffect(() => {
    if (!wavesurferRef.current || !timelineItem) return;
    
    // Skip sync during playback - only sync when paused or on large time jumps
    const currentLocalTime = wavesurferRef.current.getCurrentTime();
    const masterTime = playbackState.currentTime;
    const localTime = masterTime - timelineItem.startTime;
    const timeDiff = Math.abs(currentLocalTime - localTime);

    // Only seek if:
    // 1. Not currently playing (user clicked timeline while paused)
    // 2. OR time difference is huge (>1s, indicating a user seek not normal playback)
    const shouldSync = !playbackState.isPlaying || timeDiff > 1.0;

    if (shouldSync && timeDiff > 0.1 && localTime >= 0 && localTime <= timelineItem.duration) {
      // Set flag to prevent circular updates
      isSyncingTimeRef.current = true;
      wavesurferRef.current.setTime(localTime);
      // Reset flag after a brief delay
      setTimeout(() => {
        isSyncingTimeRef.current = false;
      }, 100);
    }
  }, [playbackState.currentTime, playbackState.isPlaying, timelineItem]);

  const handlePlayPause = () => {
    if (!wavesurferRef.current) return;
    wavesurferRef.current.playPause();
  };

  const handleDeleteClip = () => {
    if (!wavesurferRef.current || !timelineItem) return;

    const currentTime = wavesurferRef.current.getCurrentTime();

    // Find the clip that contains the current time
    const clip = timelineItem.clips.find(
      (clip) => currentTime >= clip.startTime && currentTime <= clip.endTime
    );

    if (clip) {
      removeClip(timelineItemId, clip.id);
    }
  };

  const handleMuteSelection = async () => {
    if (!selectedRegion || !timelineItem) return;

    const { start: selStart, end: selEnd } = selectedRegion;

    // Find all clips that overlap with the selection
    const overlappingClips = timelineItem.clips.filter(
      (clip) =>
        (selStart < clip.endTime && selEnd > clip.startTime)
    );

    // Sort by start time
    overlappingClips.sort((a, b) => a.startTime - b.startTime);

    // Process each overlapping clip
    for (const clip of overlappingClips) {
      // Remove the original clip
      await removeClip(timelineItemId, clip.id);

      const newClips = [];

      // Before selection: keep unmuted
      if (clip.startTime < selStart) {
        newClips.push({
          id: uuidv4(),
          startTime: clip.startTime,
          endTime: Math.min(clip.endTime, selStart),
          muted: clip.muted,
        });
      }

      // Inside selection: mute this part
      const muteStart = Math.max(clip.startTime, selStart);
      const muteEnd = Math.min(clip.endTime, selEnd);
      if (muteStart < muteEnd) {
        newClips.push({
          id: uuidv4(),
          startTime: muteStart,
          endTime: muteEnd,
          muted: true,
        });
      }

      // After selection: keep unmuted
      if (clip.endTime > selEnd) {
        newClips.push({
          id: uuidv4(),
          startTime: Math.max(clip.startTime, selEnd),
          endTime: clip.endTime,
          muted: clip.muted,
        });
      }

      // Add new clips
      for (const newClip of newClips) {
        await addClip(timelineItemId, newClip);
      }
    }

    // Clear selection region (the user-drawn purple one, not the muted red ones)
    setSelectedRegion(null);
    if (regionsRef.current) {
      // Only remove non-muted regions (the purple selection region)
      // The muted regions will be re-rendered by renderClips
      regionsRef.current.getRegions().forEach((r) => {
        // Remove regions that are the selection color (purple), not muted color (red/orange)
        const color = r.color || '';
        if (color.includes('124, 58, 237')) { // Purple selection region
          r.remove();
        }
      });
    }
    
    // Force immediate re-render of clips to show the newly muted regions
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      renderClips();
    });
  };

  const handleClearSelection = () => {
    setSelectedRegion(null);
    if (regionsRef.current) {
      regionsRef.current.getRegions().forEach((r) => r.remove());
    }
  };

  const handleWaveformZoomIn = () => {
    setWaveformZoom((prev) => Math.min(200, prev + 10));
  };

  const handleWaveformZoomOut = () => {
    setWaveformZoom((prev) => Math.max(10, prev - 10));
  };

  const handleWaveformWheel = useCallback((e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY;
      setWaveformZoom((prev) => Math.max(10, Math.min(200, prev - delta * 0.05)));
    }
    // Otherwise allow normal scrolling (horizontal)
  }, []);

  // Attach wheel event listener with passive: false to allow preventDefault
  useEffect(() => {
    const container = waveformContainerRef.current;
    if (!container) return;

    container.addEventListener('wheel', handleWaveformWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWaveformWheel);
    };
  }, [handleWaveformWheel]);

  // Handle clicking on waveform to select a muted clip
  const handleWaveformClick = useCallback((e: React.MouseEvent) => {
    if (!wavesurferRef.current || !timelineItem) return;

    const currentTime = wavesurferRef.current.getCurrentTime();

    // Find which clip was clicked
    const clickedClip = timelineItem.clips.find(
      (clip) => clip.muted && currentTime >= clip.startTime && currentTime < clip.endTime
    );

    if (clickedClip) {
      // Clear any existing selection and select this muted clip
      setSelectedRegion(null);
      setSelectedClipId(clickedClip.id);
      // Remove any purple selection regions
      if (regionsRef.current) {
        regionsRef.current.getRegions().forEach((r) => {
          const color = r.color || '';
          if (color.includes('124, 58, 237')) { // Purple selection region
            r.remove();
          }
        });
      }
    } else {
      setSelectedClipId(null);
    }
  }, [timelineItem]);

  // Toggle redaction mode for a specific clip
  const handleToggleClipRedactionMode = useCallback(async (clipId: string) => {
    if (!timelineItem) return;

    const clip = timelineItem.clips.find((c) => c.id === clipId);
    if (!clip || !clip.muted) return;

    const currentMode = clip.redactionMode || globalRedactionMode;
    const newMode = currentMode === 'tone' ? 'silence' : 'tone';

    await updateClip(timelineItemId, clipId, { redactionMode: newMode });
  }, [timelineItem, globalRedactionMode, timelineItemId, updateClip]);

  // Remove a muted clip (un-redact)
  const handleRemoveRedactedClip = useCallback(async (clipId: string) => {
    if (!timelineItem) return;

    const clip = timelineItem.clips.find((c) => c.id === clipId);
    if (!clip || !clip.muted) return;

    // Unmute the clip instead of removing it
    await updateClip(timelineItemId, clipId, { muted: false });
    setSelectedClipId(null);
  }, [timelineItem, timelineItemId, updateClip]);

  // Clear all redactions (unmute all muted clips)
  const handleClearAllRedactions = useCallback(async () => {
    if (!timelineItem) return;
    
    // Find all muted clips
    const mutedClips = timelineItem.clips.filter(clip => clip.muted);
    
    if (mutedClips.length === 0) return;
    
    // Confirm with user
    if (!confirm(`Clear all ${mutedClips.length} redacted section${mutedClips.length !== 1 ? 's' : ''}? This cannot be undone.`)) {
      return;
    }
    
    // Unmute all clips
    for (const clip of mutedClips) {
      await updateClip(timelineItemId, clip.id, { muted: false });
    }
    
    // Clear any selections
    setSelectedClipId(null);
    setSelectedRegion(null);
  }, [timelineItem, timelineItemId, updateClip]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  // Calculate muted duration
  const getMutedDuration = () => {
    if (!timelineItem) return 0;
    return timelineItem.clips
      .filter(clip => clip.muted)
      .reduce((total, clip) => total + (clip.endTime - clip.startTime), 0);
  };

  const mutedDuration = getMutedDuration();
  const mutedCount = timelineItem?.clips.filter(clip => clip.muted).length || 0;

  if (!timelineItem || !mediaFile) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        Select media in timeline to process
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex-shrink-0 overflow-x-auto max-w-full">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-lg font-semibold">{mediaFile.name}</h3>
          {mutedCount > 0 && (
            <div className="flex items-center gap-2">
              <div className="bg-destructive/10 text-destructive px-2 py-1 rounded text-xs font-medium">
                {mutedCount} section{mutedCount !== 1 ? 's' : ''} muted ({formatTime(mutedDuration)})
              </div>
              <Button 
                onClick={handleClearAllRedactions} 
                variant="outline" 
                size="sm"
                className="h-7 text-xs"
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Clear All
              </Button>
            </div>
          )}
        </div>
        <div className="text-sm text-muted-foreground mb-4">
          {formatTime(playbackState.currentTime)} / {formatTime(mediaFile.duration)}
        </div>

        {/* Playback controls */}
        <div className="flex gap-2 flex-wrap">
          <Button onClick={handlePlayPause} size="icon" variant="outline">
            {playbackState.isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>
          <Button onClick={handleDeleteClip} variant="outline" size="sm">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete Clip
          </Button>

          {/* Selection actions */}
          {selectedRegion && (
            <>
              <Separator orientation="vertical" className="h-8" />
              <div className="text-xs text-muted-foreground flex items-center px-2">
                Selection: {formatTime(selectedRegion.start)} - {formatTime(selectedRegion.end)}
              </div>
              <Button onClick={handleMuteSelection} variant="outline" size="sm">
                Mute Selection
              </Button>
              <Button onClick={handleClearSelection} variant="ghost" size="sm">
                Clear
              </Button>
            </>
          )}

          {/* Selected redacted clip controls */}
          {selectedClip && (
            <>
              <Separator orientation="vertical" className="h-8" />
              <div className="text-xs text-muted-foreground flex items-center px-2">
                Redacted: {formatTime(selectedClip.startTime)} - {formatTime(selectedClip.endTime)}
              </div>
              <Button
                onClick={() => handleToggleClipRedactionMode(selectedClip.id)}
                variant="outline"
                size="sm"
              >
                {(selectedClip.redactionMode || globalRedactionMode) === 'tone' ? (
                  <>
                    <VolumeX className="mr-2 h-4 w-4" />
                    Use Silence
                  </>
                ) : (
                  <>
                    <Volume2 className="mr-2 h-4 w-4" />
                    Use Tone
                  </>
                )}
              </Button>
              <Button
                onClick={() => handleRemoveRedactedClip(selectedClip.id)}
                variant="outline"
                size="sm"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Un-redact
              </Button>
            </>
          )}
        </div>

        {!selectedRegion && !selectedClip && (
          <p className="text-xs text-muted-foreground mt-2">
            Click and drag on the waveform to select a region to mute{mutedCount > 0 && '. Click on a red/orange redacted region to un-redact or change its tone'}
          </p>
        )}

        {/* Waveform zoom controls */}
        <div className="flex items-center gap-2 mt-3">
          <span className="text-xs text-muted-foreground">Waveform Zoom:</span>
          <Button size="icon" variant="outline" onClick={handleWaveformZoomOut} className="h-7 w-7">
            <ZoomOut className="h-3 w-3" />
          </Button>
          <span className="text-xs font-mono w-12 text-center">{Math.round(waveformZoom)}px/s</span>
          <Button size="icon" variant="outline" onClick={handleWaveformZoomIn} className="h-7 w-7">
            <ZoomIn className="h-3 w-3" />
          </Button>
          <span className="text-xs text-muted-foreground">(or Cmd/Ctrl + Scroll)</span>
        </div>
      </div>

      {/* Waveform */}
      <div
        ref={waveformContainerRef}
        className="p-4 flex-shrink-0 overflow-x-auto overflow-y-hidden max-w-full cursor-pointer"
        onClick={handleWaveformClick}
        style={{ width: '100%' }}
      >
        <div ref={waveformRef} />
      </div>

      <Separator className="flex-shrink-0" />

      {/* Transcript */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <TranscriptView timelineItemId={timelineItemId} />
      </div>
    </div>
  );
}
