'use client';

import { useState } from 'react';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Loader2, Volume2, VolumeX, AlertCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface TranscriptViewProps {
  timelineItemId: string;
}

export function TranscriptView({ timelineItemId }: TranscriptViewProps) {
  const { timelineItems, mediaFiles, setTranscript, addClip, updateClip } = useStore();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timelineItem = timelineItems.find((item) => item.id === timelineItemId);
  const mediaFile = timelineItem ? mediaFiles.find((m) => m.id === timelineItem.mediaId) : null;

  const handleTranscribe = async () => {
    if (!mediaFile) return;

    setIsTranscribing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('audio', mediaFile.file);

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.details || data.error || 'Transcription failed';
        throw new Error(errorMsg);
      }

      if (!data.transcript) {
        throw new Error('No transcript in response');
      }

      await setTranscript(timelineItemId, data.transcript);
    } catch (err) {
      console.error('Transcription error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to transcribe audio';
      setError(`${errorMessage}. Please check your Deepgram API key and try again.`);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleWordClick = async (wordStart: number, wordEnd: number) => {
    if (!timelineItem) return;

    // Find the clip that contains this word
    const containingClip = timelineItem.clips.find(
      (c) => wordStart >= c.startTime && wordEnd <= c.endTime
    );

    if (!containingClip) return;

    // Check if this clip is exactly the word (already split out)
    const isExactMatch =
      Math.abs(containingClip.startTime - wordStart) < 0.01 &&
      Math.abs(containingClip.endTime - wordEnd) < 0.01;

    if (isExactMatch) {
      // Just toggle the mute state
      await updateClip(timelineItemId, containingClip.id, { muted: !containingClip.muted });
    } else {
      // Split the clip into three parts: before, word, after
      const clipsBefore: any[] = [];
      const clipsAfter: any[] = [];

      // Before the word
      if (wordStart > containingClip.startTime) {
        clipsBefore.push({
          id: uuidv4(),
          startTime: containingClip.startTime,
          endTime: wordStart,
          muted: containingClip.muted,
        });
      }

      // The word itself (toggled mute state)
      const wordClip = {
        id: uuidv4(),
        startTime: wordStart,
        endTime: wordEnd,
        muted: !containingClip.muted,
      };

      // After the word
      if (wordEnd < containingClip.endTime) {
        clipsAfter.push({
          id: uuidv4(),
          startTime: wordEnd,
          endTime: containingClip.endTime,
          muted: containingClip.muted,
        });
      }

      // Update the store: remove the original clip and add the new clips
      const { removeClip, addClip } = useStore.getState();
      await removeClip(timelineItemId, containingClip.id);

      for (const clip of clipsBefore) {
        await addClip(timelineItemId, clip);
      }
      await addClip(timelineItemId, wordClip);
      for (const clip of clipsAfter) {
        await addClip(timelineItemId, clip);
      }
    }
  };

  const isWordMuted = (wordStart: number, wordEnd: number): boolean => {
    if (!timelineItem) return false;

    // Find a clip that matches this word exactly or contains it
    const clip = timelineItem.clips.find((c) => {
      // Check for exact match (within 10ms tolerance)
      const isExactMatch =
        Math.abs(c.startTime - wordStart) < 0.01 &&
        Math.abs(c.endTime - wordEnd) < 0.01;

      // Or check if it contains the word
      const contains = wordStart >= c.startTime && wordEnd <= c.endTime;

      return isExactMatch || contains;
    });

    return clip?.muted || false;
  };

  if (!timelineItem || !mediaFile) {
    return null;
  }

  if (!timelineItem.transcript) {
    return (
      <div className="p-4">
        <div className="border rounded-lg p-6 text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            No transcript available. Transcribe this audio to enable word-level redaction.
          </p>
          
          {/* Privacy Warning */}
          <div className="border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950 p-4 rounded text-left">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="space-y-2">
                <p className="text-sm font-semibold text-blue-900 dark:text-blue-100">
                  Privacy Notice: Transcription Service
                </p>
                <div className="text-xs text-blue-800 dark:text-blue-200 space-y-1">
                  <p>
                    When you click "Transcribe Audio", your audio file will be sent to <strong>Deepgram's API</strong> for speech-to-text processing.
                  </p>
                  <p>
                    <strong>Important:</strong> Deepgram processes the audio and immediately returns the transcript. 
                    No audio or transcript data is stored on Deepgram's servers after processing completes.
                  </p>
                  <p className="text-blue-700 dark:text-blue-300 font-medium">
                    The transcript will be stored locally in your browser only.
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          <Button onClick={handleTranscribe} disabled={isTranscribing}>
            {isTranscribing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Transcribing...
              </>
            ) : (
              'Transcribe Audio'
            )}
          </Button>
          {error && <p className="text-sm text-destructive mt-2">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="mb-4">
        <h4 className="text-sm font-semibold mb-2">Transcript</h4>
        <p className="text-xs text-muted-foreground">
          Hover over words to see redaction controls. Click to toggle mute.
        </p>
      </div>

      <div className="space-y-4">
        {timelineItem.transcript.segments.map((segment, segmentIndex) => (
          <div key={segmentIndex} className="border-l-2 border-border pl-4">
            <div className="text-xs text-muted-foreground mb-2">
              {formatTime(segment.start)} - {formatTime(segment.end)}
            </div>
            <div className="text-sm leading-relaxed">
              {segment.words.map((word, wordIndex) => {
                const isMuted = isWordMuted(word.start, word.end);
                return (
                  <span key={wordIndex} className="inline-block mr-1 group relative">
                    <span
                      className={`cursor-pointer rounded px-1 transition-all ${
                        isMuted
                          ? 'bg-destructive/20 text-destructive line-through'
                          : 'hover:bg-primary/10'
                      }`}
                      onClick={() => handleWordClick(word.start, word.end)}
                    >
                      {word.word}
                    </span>
                    <span className="absolute -top-8 left-0 hidden group-hover:flex items-center gap-1 bg-popover text-popover-foreground text-xs px-2 py-1 rounded border shadow-md whitespace-nowrap z-10">
                      {isMuted ? (
                        <>
                          <VolumeX className="h-3 w-3" />
                          Muted
                        </>
                      ) : (
                        <>
                          <Volume2 className="h-3 w-3" />
                          Click to mute
                        </>
                      )}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
