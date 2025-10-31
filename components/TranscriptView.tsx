'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Loader2, Volume2, VolumeX, AlertCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { TranscriptWord } from '@/lib/types';

interface TranscriptViewProps {
  timelineItemId: string;
}

export function TranscriptView({ timelineItemId }: TranscriptViewProps) {
  const { timelineItems, mediaFiles, setTranscript, addClip, updateClip, removeClip, playbackState } = useStore();
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedWords, setSelectedWords] = useState<TranscriptWord[]>([]);
  const [isSelecting, setIsSelecting] = useState(false);
  const activeWordRef = useRef<HTMLSpanElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const timelineItem = timelineItems.find((item) => item.id === timelineItemId);
  const mediaFile = timelineItem ? mediaFiles.find((m) => m.id === timelineItem.mediaId) : null;

  // Calculate current time relative to this timeline item
  const currentLocalTime = timelineItem ? playbackState.currentTime - timelineItem.startTime : 0;

  const handleTranscribe = async () => {
    if (!mediaFile) return;

    setIsTranscribing(true);
    setError(null);

    try {
      // Get temporary Deepgram token from our backend
      const tokenResponse = await fetch('/api/deepgram-key');
      const tokenData = await tokenResponse.json();

      if (!tokenResponse.ok) {
        throw new Error(tokenData.error || 'Failed to get authentication token');
      }

      // Convert File to ArrayBuffer for Deepgram
      const arrayBuffer = await mediaFile.file.arrayBuffer();

      // Call Deepgram directly from the browser using temporary token
      const response = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&diarize=true&language=en', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenData.token}`,
          'Content-Type': mediaFile.file.type,
        },
        body: arrayBuffer,
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.err_msg || data.error || 'Transcription failed';
        throw new Error(errorMsg);
      }

      // Process the Deepgram response into our format
      const words = data.results?.channels[0]?.alternatives[0]?.words || [];

      // Group words into segments based on speaker changes or 1-second gaps
      const segments: Array<{
        words: Array<{ word: string; start: number; end: number; confidence: number; speaker?: number }>;
        start: number;
        end: number;
        speaker?: number;
      }> = [];

      let currentSegment: typeof segments[0] | null = null;

      for (const word of words) {
        if (!word.word || word.start === undefined || word.end === undefined) continue;

        const wordData = {
          word: word.word,
          start: word.start,
          end: word.end,
          confidence: word.confidence || 0,
          speaker: word.speaker,
        };

        if (!currentSegment) {
          currentSegment = {
            words: [wordData],
            start: word.start,
            end: word.end,
            speaker: word.speaker,
          };
        } else {
          // Check if there's a speaker change OR more than 1 second gap
          const gap = word.start - currentSegment.end;
          const speakerChanged = word.speaker !== undefined &&
                                 currentSegment.speaker !== undefined &&
                                 word.speaker !== currentSegment.speaker;

          if (speakerChanged || gap > 1.0) {
            segments.push(currentSegment);
            currentSegment = {
              words: [wordData],
              start: word.start,
              end: word.end,
              speaker: word.speaker,
            };
          } else {
            currentSegment.words.push(wordData);
            currentSegment.end = word.end;
          }
        }
      }

      if (currentSegment) {
        segments.push(currentSegment);
      }

      const transcript = {
        segments,
        fullText: data.results?.channels[0]?.alternatives[0]?.transcript || '',
      };

      await setTranscript(timelineItemId, transcript);
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

  const isWordSelected = (word: TranscriptWord): boolean => {
    return selectedWords.some(w => w.start === word.start && w.end === word.end);
  };

  const isWordActive = (word: TranscriptWord): boolean => {
    // Check if current playback time is within this word's time range
    return currentLocalTime >= word.start && currentLocalTime <= word.end;
  };

  // Auto-scroll to active word (both during playback and when seeking)
  useEffect(() => {
    if (activeWordRef.current && containerRef.current) {
      // Check if we're in a valid time range for this timeline item
      const isInRange = currentLocalTime >= 0 && currentLocalTime <= (timelineItem?.duration || 0);

      if (isInRange) {
        activeWordRef.current.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      }
    }
  }, [currentLocalTime, timelineItem?.duration]);

  const handleWordMouseDown = (word: TranscriptWord) => {
    setIsSelecting(true);
    setSelectedWords([word]);
  };

  const handleWordMouseEnter = (word: TranscriptWord) => {
    if (isSelecting) {
      setSelectedWords(prev => {
        // Check if word is already selected
        const isAlreadySelected = prev.some(w => w.start === word.start && w.end === word.end);
        if (isAlreadySelected) return prev;
        return [...prev, word];
      });
    }
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
  };

  const handleClearSelection = () => {
    setSelectedWords([]);
  };

  // Check if all selected words are already muted
  const areAllSelectedWordsMuted = useCallback(() => {
    if (selectedWords.length === 0) return false;
    return selectedWords.every(word => isWordMuted(word.start, word.end));
  }, [selectedWords]);

  const handleBulkRedact = useCallback(async () => {
    if (selectedWords.length === 0 || !timelineItem) return;

    // Sort selected words by start time
    const sortedWords = [...selectedWords].sort((a, b) => a.start - b.start);

    // Find the overall time range
    const selStart = sortedWords[0].start;
    const selEnd = sortedWords[sortedWords.length - 1].end;

    // Determine if we're redacting or un-redacting
    const shouldUnredact = areAllSelectedWordsMuted();

    // Find all clips that overlap with the selection
    const overlappingClips = timelineItem.clips.filter(
      (clip) => (selStart < clip.endTime && selEnd > clip.startTime)
    );

    // Sort by start time
    overlappingClips.sort((a, b) => a.startTime - b.startTime);

    // Process each overlapping clip
    for (const clip of overlappingClips) {
      // Remove the original clip
      await removeClip(timelineItemId, clip.id);

      const newClips = [];

      // Before selection: keep unchanged
      if (clip.startTime < selStart) {
        newClips.push({
          id: uuidv4(),
          startTime: clip.startTime,
          endTime: Math.min(clip.endTime, selStart),
          muted: clip.muted,
        });
      }

      // Inside selection: toggle mute state
      const muteStart = Math.max(clip.startTime, selStart);
      const muteEnd = Math.min(clip.endTime, selEnd);
      if (muteStart < muteEnd) {
        newClips.push({
          id: uuidv4(),
          startTime: muteStart,
          endTime: muteEnd,
          muted: shouldUnredact ? false : true, // Toggle based on current state
        });
      }

      // After selection: keep unchanged
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

    // Clear selection
    setSelectedWords([]);
  }, [selectedWords, timelineItem, timelineItemId, removeClip, addClip, areAllSelectedWordsMuted]);

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

  // Speaker color mapping
  const getSpeakerColor = (speaker?: number) => {
    if (speaker === undefined) return 'border-border';
    const colors = [
      'border-blue-500',
      'border-green-500',
      'border-purple-500',
      'border-orange-500',
      'border-pink-500',
      'border-cyan-500',
    ];
    return colors[speaker % colors.length];
  };

  const getSpeakerBgColor = (speaker?: number) => {
    if (speaker === undefined) return 'bg-muted/30';
    const colors = [
      'bg-blue-50 dark:bg-blue-950/20',
      'bg-green-50 dark:bg-green-950/20',
      'bg-purple-50 dark:bg-purple-950/20',
      'bg-orange-50 dark:bg-orange-950/20',
      'bg-pink-50 dark:bg-pink-950/20',
      'bg-cyan-50 dark:bg-cyan-950/20',
    ];
    return colors[speaker % colors.length];
  };

  return (
    <div className="flex flex-col h-full relative" onMouseUp={handleMouseUp}>
      {/* Sticky header */}
      <div className="p-4 border-b bg-background sticky top-0 z-10">
        <h4 className="text-sm font-semibold mb-2">Transcript</h4>
        <p className="text-xs text-muted-foreground">
          Click and drag to select multiple words, then redact them at once. Single-click to toggle individual words.
        </p>
      </div>

      {/* Floating selection action bar - absolutely positioned, overlays on top */}
      {selectedWords.length > 0 && (
        <div className="absolute top-[85px] left-4 right-4 z-20 animate-in slide-in-from-top-2 duration-200 pointer-events-none">
          <div className="flex items-center gap-2 p-2 bg-primary/95 backdrop-blur-sm rounded-lg border border-primary shadow-lg pointer-events-auto">
            <span className="text-xs font-medium text-primary-foreground">
              {selectedWords.length} word{selectedWords.length !== 1 ? 's' : ''} selected
            </span>
            <Button onClick={handleBulkRedact} size="sm" variant="secondary">
              {areAllSelectedWordsMuted() ? (
                <>
                  <Volume2 className="mr-2 h-3 w-3" />
                  Un-redact Selection
                </>
              ) : (
                <>
                  <VolumeX className="mr-2 h-3 w-3" />
                  Redact Selection
                </>
              )}
            </Button>
            <Button onClick={handleClearSelection} size="sm" variant="ghost" className="text-primary-foreground hover:bg-primary-foreground/20">
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Scrollable transcript content - with top padding to prevent content from being hidden under floating bar */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4 pt-16 space-y-4" style={{ userSelect: 'none' }}>
        {timelineItem.transcript.segments.map((segment, segmentIndex) => (
          <div
            key={segmentIndex}
            className={`border-l-4 pl-4 py-2 rounded-r ${getSpeakerBgColor(segment.speaker)} ${getSpeakerColor(segment.speaker)}`}
          >
            <div className="flex items-center gap-2 mb-2">
              {segment.speaker !== undefined && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-background/50">
                  Speaker {segment.speaker}
                </span>
              )}
              <div className="text-xs text-muted-foreground">
                {formatTime(segment.start)} - {formatTime(segment.end)}
              </div>
            </div>
            <div className="text-sm leading-relaxed">
              {segment.words.map((word, wordIndex) => {
                const isMuted = isWordMuted(word.start, word.end);
                const isSelected = isWordSelected(word);
                const isActive = isWordActive(word);
                return (
                  <span key={wordIndex} className="inline-block mr-1 group relative">
                    <span
                      ref={isActive ? activeWordRef : null}
                      className={`cursor-pointer rounded px-1 transition-all ${
                        isActive
                          ? 'bg-yellow-300 dark:bg-yellow-600 text-yellow-900 dark:text-yellow-100 font-bold ring-2 ring-yellow-500'
                          : isSelected
                          ? 'bg-primary text-primary-foreground'
                          : isMuted
                          ? 'bg-destructive/20 text-destructive line-through'
                          : 'hover:bg-primary/10'
                      }`}
                      onMouseDown={() => handleWordMouseDown(word)}
                      onMouseEnter={() => handleWordMouseEnter(word)}
                      onClick={(e) => {
                        // Only trigger single-click if not selecting
                        if (!isSelecting && selectedWords.length === 0) {
                          handleWordClick(word.start, word.end);
                        }
                        e.preventDefault();
                      }}
                    >
                      {word.word}
                    </span>
                    {!isSelecting && selectedWords.length === 0 && !isActive && (
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
                    )}
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
