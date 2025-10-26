'use client';

import { MediaLibrary } from '@/components/MediaLibrary';
import { Timeline } from '@/components/Timeline';
import { AudioEditor } from '@/components/AudioEditor';
import { useStore } from '@/lib/store';
import { useEffect } from 'react';

export default function Home() {
  const { selectedTimelineItemId } = useStore();

  // Suppress AbortError globally
  useEffect(() => {
    const errorHandler = (event: ErrorEvent) => {
      if (event.error?.name === 'AbortError' || event.message?.includes('AbortError')) {
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
    };

    window.addEventListener('error', errorHandler);
    return () => window.removeEventListener('error', errorHandler);
  }, []);

  // Handle spacebar for play/pause
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.code === 'Space' && e.target === document.body) {
        e.preventDefault();
        const { playbackState, setPlaybackState } = useStore.getState();
        setPlaybackState({ isPlaying: !playbackState.isPlaying });
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, []);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-background px-6 py-4">
        <h1 className="text-2xl font-bold">Audio Redaction Tool</h1>
        <p className="text-sm text-muted-foreground">
          Public Safety Audio Processing and Redaction
        </p>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane - Media Library */}
        <div className="w-80 flex-shrink-0">
          <MediaLibrary />
        </div>

        {/* Middle Pane - Timeline */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ width: '100%' }}>
          <div className="h-1/3 border-b overflow-hidden">
            <Timeline />
          </div>

          {/* Bottom Pane - Media Editor */}
          <div className="flex-1 overflow-hidden">
            {selectedTimelineItemId ? (
              <AudioEditor timelineItemId={selectedTimelineItemId} />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground">
                Select media in timeline to process
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
