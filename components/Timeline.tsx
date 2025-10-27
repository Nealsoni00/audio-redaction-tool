'use client';

import { useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Play, Pause, Trash2, ZoomIn, ZoomOut, Download, Volume2, VolumeX, FileDown, X } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export function Timeline() {
  const {
    timelineItems,
    mediaFiles,
    selectedTimelineItemId,
    playbackState,
    addToTimeline,
    removeFromTimeline,
    selectTimelineItem,
    setPlaybackState,
    wavesurferInstance,
    globalRedactionMode,
    setGlobalRedactionMode,
  } = useStore();

  const timelineRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(50); // pixels per second - start at a reasonable zoom level
  const [dragPreview, setDragPreview] = useState<{ time: number; duration: number; itemId?: string } | null>(null);
  const dragUpdateRef = useRef<number | null>(null);
  const hasInitializedZoom = useRef(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; itemId: string } | null>(null);
  const dragOffsetRef = useRef<number>(0); // Store offset from where user grabbed the item

  // Calculate total timeline duration (with padding for infinite timeline)
  const maxItemEnd = useMemo(() => {
    return timelineItems.reduce((max, item) => {
      const itemEnd = item.startTime + item.duration;
      return Math.max(max, itemEnd);
    }, 0);
  }, [timelineItems]);

  // Add reasonable padding beyond the last item for working space
  const totalDuration = useMemo(() => {
    if (timelineItems.length === 0) return 60; // Default empty timeline
    // Add just 10 seconds or 10% extra padding, whichever is larger (max 20 seconds)
    const padding = Math.min(20, Math.max(10, maxItemEnd * 0.1));
    return maxItemEnd + padding;
  }, [maxItemEnd, timelineItems.length]);

  // Auto-adjust zoom to fit content in viewport on first load
  useEffect(() => {
    if (!hasInitializedZoom.current && timelineRef.current && timelineItems.length > 0) {
      const containerWidth = timelineRef.current.clientWidth;
      if (containerWidth > 0) {
      // Calculate zoom to fit content with some margin (use 80% of viewport)
      const targetWidth = containerWidth * 0.8;
      const adaptiveZoom = Math.floor(targetWidth / totalDuration);
      // Clamp between 5 and 100 px/s
      const clampedZoom = Math.max(5, Math.min(100, adaptiveZoom));
      setZoom(clampedZoom);
        hasInitializedZoom.current = true;
      }
    }
  }, [timelineItems.length, totalDuration]);

  // Note: Playhead position is calculated directly in the render, no need to force updates on zoom

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();

    // Cancel any pending drag preview update
    if (dragUpdateRef.current) {
      cancelAnimationFrame(dragUpdateRef.current);
    }

    // Capture values before requestAnimationFrame to avoid null reference
    const currentTarget = e.currentTarget as HTMLElement;
    const clientX = e.clientX;
    const hasMediaDuration = e.dataTransfer.types.includes('mediaduration');
    const mediaDuration = hasMediaDuration ? parseFloat(e.dataTransfer.getData('mediaDuration') || '0') : 0;
    const hasTimelineItem = e.dataTransfer.types.includes('timelineitemid');

    // Throttle drag preview updates using requestAnimationFrame
    dragUpdateRef.current = requestAnimationFrame(() => {
      if (!currentTarget) return;
      
      // Calculate the drop position
      const rect = currentTarget.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const scrollLeft = currentTarget.scrollLeft;
      const totalX = clickX + scrollLeft;
      
      // Calculate position accounting for where user grabbed the item
      const mouseTimePx = totalX - dragOffsetRef.current;
      const newStartTime = Math.max(0, mouseTimePx / zoom);

      // Always update the preview position
      setDragPreview(prev => {
        // If we're already dragging something, update its position
        if (prev) {
          return { ...prev, time: newStartTime };
        }

        // New media file from library
        if (mediaDuration > 0) {
          dragOffsetRef.current = 0; // No offset for new files
          const directTime = Math.max(0, totalX / zoom);
          return { time: directTime, duration: mediaDuration };
        }

        // Timeline item being dragged (should have been set in dragStart)
        if (hasTimelineItem) {
          return { time: newStartTime, duration: 0 };
        }

        return null;
      });
    });
  }, [zoom]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    // Check if it's a pinch-to-zoom gesture (two-finger scroll on trackpad)
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY;
      setZoom((prev) => Math.max(5, Math.min(500, prev - delta * 0.1)));
    }
    // Otherwise allow normal scrolling (horizontal/vertical)
  }, []);

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(500, prev + 20));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(5, prev - 20));
  };

  const togglePlayback = () => {
    if (wavesurferInstance) {
      wavesurferInstance.playPause();
    } else if (timelineItems.length > 0) {
      // If no file selected but timeline has items, select the first one
      const firstItem = timelineItems[0];
      selectTimelineItem(firstItem.id);
      // The play will happen automatically once the AudioEditor loads
      setPlaybackState({ isPlaying: true, currentTime: 0 });
    } else {
      // No items in timeline, just toggle state
      setPlaybackState({ isPlaying: !playbackState.isPlaying });
    }
  };

  const formatTime = useCallback((seconds: number, includeMs = false) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    if (includeMs) {
      return `${mins}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const handleTimelineItemClick = (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation(); // Prevent timeline click handler from firing
    selectTimelineItem(itemId);
  };

  const handleRemoveItem = (e: React.MouseEvent, itemId: string) => {
    e.stopPropagation();
    removeFromTimeline(itemId);
  };

  const handleTimelineItemDragStart = useCallback(
    (e: React.DragEvent, itemId: string) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('timelineItemId', itemId);

      // Set initial drag preview with the item's duration
      const item = timelineItems.find(i => i.id === itemId);
      if (item && timelineRef.current) {
        // Calculate where the mouse grabbed the item (offset from item start)
        const rect = timelineRef.current.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const scrollLeft = timelineRef.current.scrollLeft;
        const totalX = clickX + scrollLeft;
        const itemStartPx = item.startTime * zoom;
        dragOffsetRef.current = totalX - itemStartPx; // Store offset where user grabbed
        
        setDragPreview({ time: item.startTime, duration: item.duration, itemId });
      }
    },
    [timelineItems, zoom]
  );

  const handleTimelineDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Cancel any pending drag preview update
      if (dragUpdateRef.current) {
        cancelAnimationFrame(dragUpdateRef.current);
        dragUpdateRef.current = null;
      }

      const timelineItemId = e.dataTransfer.getData('timelineItemId');
      const mediaId = e.dataTransfer.getData('mediaId');

      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const scrollLeft = (e.currentTarget as HTMLElement).scrollLeft;
      const totalX = clickX + scrollLeft;
      
      // Calculate position with drag offset
      const mouseTimePx = totalX - dragOffsetRef.current;
      let newStartTime = Math.max(0, mouseTimePx / zoom);
      
      // If timeline is empty and we're adding a new file, snap to 0
      if (mediaId && timelineItems.length === 0) {
        newStartTime = 0;
      }

      if (mediaId) {
        // Dropping from media library - add at the drop position
        const newItemId = await addToTimeline(mediaId);
        if (newItemId) {
          const { updateTimelineItem } = useStore.getState();
          await updateTimelineItem(newItemId, { startTime: newStartTime });
        }
      } else if (timelineItemId) {
        // Moving a timeline item - use offset position
        const { updateTimelineItem } = useStore.getState();
        await updateTimelineItem(timelineItemId, { startTime: newStartTime });
      }

      // Clear drag preview and reset offset
      setDragPreview(null);
      dragOffsetRef.current = 0;
    },
    [addToTimeline, zoom, timelineItems.length]
  );

  const handleDragLeave = useCallback(() => {
    // Cancel any pending drag preview update
    if (dragUpdateRef.current) {
      cancelAnimationFrame(dragUpdateRef.current);
      dragUpdateRef.current = null;
    }
    setDragPreview(null);
    dragOffsetRef.current = 0;
  }, []);

  const handleTimelineClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Don't handle clicks on buttons or interactive elements
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.closest('button')) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const scrollLeft = (e.currentTarget as HTMLElement).scrollLeft;
    const totalX = clickX + scrollLeft;
    const clickedTime = Math.max(0, totalX / zoom);

    // Set master timeline position - AudioEditor will handle converting to local position
    setPlaybackState({ currentTime: clickedTime });
  }, [zoom, setPlaybackState]);

  useEffect(() => {
    setPlaybackState({ duration: maxItemEnd });
  }, [maxItemEnd, setPlaybackState]);

  // Auto-select first timeline item when media is added to empty timeline
  useEffect(() => {
    if (timelineItems.length > 0 && !selectedTimelineItemId) {
      selectTimelineItem(timelineItems[0].id);
    }
  }, [timelineItems.length, selectedTimelineItemId, selectTimelineItem, timelineItems]);

  const handleExport = async () => {
    if (timelineItems.length === 0) return;

    try {
      // Create an AudioContext for processing
      const audioContext = new AudioContext();
      const sampleRate = audioContext.sampleRate;

      // Calculate total duration of the timeline
      const timelineDuration = maxItemEnd;
      const totalSamples = Math.ceil(timelineDuration * sampleRate);
      const outputBuffer = audioContext.createBuffer(2, totalSamples, sampleRate);

      // Process each timeline item
      for (const item of timelineItems) {
        const media = mediaFiles.find((m) => m.id === item.mediaId);
        if (!media) continue;

        // Load audio file
        const arrayBuffer = await media.file.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Get channels
        const sourceLeft = audioBuffer.getChannelData(0);
        const sourceRight = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : sourceLeft;

        const destLeft = outputBuffer.getChannelData(0);
        const destRight = outputBuffer.getChannelData(1);

        // Process ALL clips (both muted and unmuted)
        for (const clip of item.clips) {
          const timelineStartSample = Math.floor((item.startTime + clip.startTime) * sampleRate);
          const clipStartInSource = Math.floor(clip.startTime * sampleRate);
          const clipLength = Math.floor((clip.endTime - clip.startTime) * sampleRate);

          // Determine redaction mode for this clip
          const mode = clip.redactionMode || globalRedactionMode;

          if (clip.muted) {
            // Handle muted clips
            if (mode === 'tone') {
              // Generate 1kHz tone for muted region
              const frequency = 1000; // 1kHz
              const amplitude = 0.3; // 30% volume

              for (let i = 0; i < clipLength; i++) {
                const destIndex = timelineStartSample + i;
                if (destIndex < totalSamples) {
                  // Generate sine wave sample
                  const time = i / sampleRate;
                  const sample = Math.sin(2 * Math.PI * frequency * time) * amplitude;
                  destLeft[destIndex] += sample;
                  destRight[destIndex] += sample;
                }
              }
            }
            // If mode === 'silence', do nothing (leave as zeros)
          } else {
            // Copy unmuted audio data
            for (let i = 0; i < clipLength; i++) {
              const sourceIndex = clipStartInSource + i;
              const destIndex = timelineStartSample + i;

              if (sourceIndex < sourceLeft.length && destIndex < totalSamples) {
                destLeft[destIndex] += sourceLeft[sourceIndex];
                destRight[destIndex] += sourceRight[sourceIndex];
              }
            }
          }
        }
      }

      // Convert to WAV
      const wavBlob = await encodeWAV(outputBuffer);
      const url = URL.createObjectURL(wavBlob);

      // Download
      const a = document.createElement('a');
      a.href = url;
      a.download = `timeline-export-${Date.now()}.wav`;
      a.click();

      URL.revokeObjectURL(url);
      await audioContext.close();
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export timeline. Please try again.');
    }
  };

  // WAV encoder
  const encodeWAV = async (audioBuffer: AudioBuffer): Promise<Blob> => {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;

    const data = [];
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
        data.push(Math.floor(intSample));
      }
    }

    const dataSize = data.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    // RIFF header
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');

    // fmt chunk
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true); // byte rate
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);

    // data chunk
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    // Write sample data
    let offset = 44;
    for (const sample of data) {
      view.setInt16(offset, sample, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Playback Controls */}
      <div className="p-4 border-b bg-background flex-shrink-0 z-10">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={togglePlayback}
                >
                  {playbackState.isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {playbackState.isPlaying ? 'Pause' : 'Play'} timeline
              </TooltipContent>
            </Tooltip>
            <div className="text-sm font-mono tabular-nums">
              {formatTime(playbackState.currentTime, true)} / {formatTime(playbackState.duration, true)}
            </div>

            {timelineItems.length > 0 && (
              <>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={handleExport}
                      className="ml-4"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Export Timeline
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Export the entire timeline as a single audio file with all redactions applied
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
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
                          Tone
                        </>
                      ) : (
                        <>
                          <VolumeX className="mr-2 h-4 w-4" />
                          Silence
                        </>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Toggle default redaction playback mode: {globalRedactionMode === 'tone' ? 'Switch to silence' : 'Switch to tone'}
                  </TooltipContent>
                </Tooltip>
              </>
            )}
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-2 will-change-auto">
            <span className="text-xs text-muted-foreground">Zoom:</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="outline" onClick={handleZoomOut}>
                  <ZoomOut className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Zoom out timeline view
              </TooltipContent>
            </Tooltip>
            <span className="text-xs font-mono w-12 text-center tabular-nums">{Math.round(zoom)}px/s</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon" variant="outline" onClick={handleZoomIn}>
                  <ZoomIn className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                Zoom in timeline view
              </TooltipContent>
            </Tooltip>
            <span className="text-xs text-muted-foreground ml-2">
              (or Cmd/Ctrl + Scroll)
            </span>
          </div>
        </div>
      </div>

      {/* Timeline Track */}
      <div
        ref={timelineRef}
        className="p-4 bg-muted/30 cursor-pointer"
        style={{ 
          flex: 1,
          overflow: 'auto',
          width: 0, // Force flex item to not grow beyond container
          minWidth: '100%', // Fill available space
        }}
        onDrop={handleTimelineDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onWheel={handleWheel}
        onClick={handleTimelineClick}
      >
        {timelineItems.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Drop media here or right-click on media to add to timeline
          </div>
        ) : (
          <div 
            className="relative min-h-[200px]" 
            style={{ 
              width: `${totalDuration * zoom}px`,
              minWidth: '100%'
            }}
          >
            {/* Time ruler */}
            <div className="h-10 border-b relative mb-4 bg-background">
              {(() => {
                // Calculate optimal interval based on zoom level to maintain ~60-100px between markers
                const targetSpacing = 80; // pixels between markers
                const secondsPerPixel = 1 / zoom;
                const optimalInterval = Math.max(1, Math.round((targetSpacing * secondsPerPixel) / 5) * 5);

                return Array.from({ length: Math.ceil(totalDuration / optimalInterval) + 1 }).map((_, i) => {
                  const seconds = i * optimalInterval;
                  if (seconds > totalDuration) return null;

                  return (
                    <div
                      key={seconds}
                      className="absolute border-l border-border h-full"
                      style={{ left: `${seconds * zoom}px` }}
                    >
                      <div className="absolute top-0 left-1 text-xs text-muted-foreground font-mono tabular-nums whitespace-nowrap">
                        {formatTime(seconds)}
                      </div>
                      <div className="absolute top-6 left-0 w-px h-4 bg-border" />
                    </div>
                  );
                });
              })()}
            </div>

            {/* Playhead cursor */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-30"
              style={{
                left: `${playbackState.currentTime * zoom}px`,
              }}
            >
              <div className="absolute -top-2 -left-2 w-4 h-4 bg-red-500 rounded-full" />
              <div className="absolute top-12 left-3 bg-red-500 text-white px-2 py-1 rounded text-xs font-mono whitespace-nowrap shadow-lg">
                {formatTime(playbackState.currentTime, true)}
              </div>
            </div>

            {/* Drag preview indicator */}
            {dragPreview && (
              <div
                className="absolute h-16 rounded-lg border-2 border-dashed border-primary bg-primary/10 pointer-events-none z-10"
                style={{
                  width: `${dragPreview.duration * zoom}px`,
                  marginLeft: `${dragPreview.time * zoom}px`,
                  minWidth: '100px',
                  top: '48px',
                }}
              >
                <div className="absolute -top-6 left-0 bg-primary text-primary-foreground px-2 py-1 rounded text-xs font-mono whitespace-nowrap">
                  Drop at {formatTime(dragPreview.time)}
                </div>
              </div>
            )}

            {/* Timeline items */}
            <div className="space-y-2">
              {timelineItems.map((item) => {
                const media = mediaFiles.find((m) => m.id === item.mediaId);
                if (!media) return null;

                const widthPx = item.duration * zoom;
                const leftPx = item.startTime * zoom;
                const isDragging = dragPreview?.itemId === item.id;

                return (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) => handleTimelineItemDragStart(e, item.id)}
                    className={`relative h-16 rounded-lg border-2 cursor-move transition-all ${
                      isDragging
                        ? 'opacity-30'
                        : selectedTimelineItemId === item.id
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-background hover:border-primary/50'
                    }`}
                    style={{
                      width: `${widthPx}px`,
                      marginLeft: `${leftPx}px`,
                      minWidth: '100px',
                    }}
                    onClick={(e) => handleTimelineItemClick(e, item.id)}
                  >
                    {/* Redacted/Muted regions overlay */}
                    {item.clips
                      .filter((clip) => clip.muted)
                      .map((clip) => {
                        const clipWidthPx = (clip.endTime - clip.startTime) * zoom;
                        const clipLeftPx = clip.startTime * zoom;
                        return (
                          <div
                            key={clip.id}
                            className="absolute top-0 bottom-0 bg-red-500/30 border-l-2 border-r-2 border-red-500 pointer-events-none"
                            style={{
                              left: `${clipLeftPx}px`,
                              width: `${clipWidthPx}px`,
                            }}
                          />
                        );
                      })}

                    <div className="p-2 h-full flex items-center justify-between overflow-hidden relative z-10">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{media.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatTime(item.duration)}
                        </div>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 flex-shrink-0"
                            onClick={(e) => handleRemoveItem(e, item.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          Remove from timeline
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
