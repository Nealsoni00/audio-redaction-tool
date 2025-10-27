'use client';

import { MediaLibrary } from '@/components/MediaLibrary';
import { Timeline } from '@/components/Timeline';
import { AudioEditor } from '@/components/AudioEditor';
import { ResizableDivider } from '@/components/ResizableDivider';
import { useStore } from '@/lib/store';
import { useLocalStorage } from '@/lib/useLocalStorage';
import { useEffect, useState, useCallback } from 'react';
import { Info, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Home() {
  const { selectedTimelineItemId } = useStore();
  const [showPrivacyInfo, setShowPrivacyInfo] = useState(false);

  // Panel sizes (in pixels) with localStorage persistence
  const [leftPanelWidth, setLeftPanelWidth] = useLocalStorage('leftPanelWidth', 320);
  const [timelinePanelHeight, setTimelinePanelHeight] = useLocalStorage('timelinePanelHeight', 300);

  // Resize handlers
  const handleLeftPanelResize = useCallback((delta: number) => {
    setLeftPanelWidth((prev) => Math.max(200, Math.min(600, prev + delta)));
  }, [setLeftPanelWidth]);

  const handleTimelinePanelResize = useCallback((delta: number) => {
    setTimelinePanelHeight((prev) => Math.max(150, Math.min(800, prev + delta)));
  }, [setTimelinePanelHeight]);

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
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Audio Redaction Tool</h1>
            <p className="text-sm text-muted-foreground">
              Public Safety Audio Processing and Redaction
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPrivacyInfo(true)}
            className="flex items-center gap-2"
          >
            <Info className="h-4 w-4" />
            Privacy & Info
          </Button>
        </div>
      </header>

      {/* Privacy Information Modal */}
      {showPrivacyInfo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background border rounded-lg shadow-lg max-w-2xl w-full max-h-[80vh] overflow-auto">
            <div className="sticky top-0 bg-background border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold">About This Application</h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowPrivacyInfo(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="px-6 py-4 space-y-6">
              {/* What This Tool Does */}
              <div>
                <h3 className="text-lg font-semibold mb-2">What This Tool Does</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  The Audio Redaction Tool enables public safety professionals to securely redact sensitive 
                  information from audio recordings. You can select portions of audio to mute or replace with 
                  a tone, ensuring compliance with privacy regulations while maintaining the integrity of the 
                  recording timeline.
                </p>
              </div>

              {/* Privacy Notice */}
              <div className="border-l-4 border-green-500 pl-4 bg-green-50 dark:bg-green-950 p-4 rounded">
                <h3 className="text-lg font-semibold mb-2 text-green-900 dark:text-green-100">
                  🔒 Your Data Stays Private
                </h3>
                <p className="text-sm text-green-800 dark:text-green-200 leading-relaxed">
                  <strong>All audio processing happens entirely on your computer.</strong> Your audio files 
                  never leave your device. All redaction, playback, and export operations are performed 
                  locally in your browser using client-side processing.
                </p>
              </div>

              {/* Transcription Notice */}
              <div className="border-l-4 border-blue-500 pl-4 bg-blue-50 dark:bg-blue-950 p-4 rounded">
                <h3 className="text-lg font-semibold mb-2 text-blue-900 dark:text-blue-100">
                  📝 Transcription Service (Optional)
                </h3>
                <div className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed space-y-2">
                  <p>
                    <strong>If you choose to use the transcription feature:</strong>
                  </p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Audio is sent to Deepgram's API for speech-to-text processing</li>
                    <li>Deepgram processes the audio and returns the transcript</li>
                    <li>
                      <strong>No data is stored on Deepgram servers after processing completes</strong>
                    </li>
                    <li>The transcript is stored locally in your browser only</li>
                  </ul>
                  <p className="mt-2 italic">
                    Transcription is completely optional. You can use all redaction features without 
                    transcription.
                  </p>
                </div>
              </div>

              {/* Features */}
              <div>
                <h3 className="text-lg font-semibold mb-2">Key Features</h3>
                <ul className="text-sm text-muted-foreground leading-relaxed space-y-1 list-disc list-inside">
                  <li>Drag and drop audio files to get started</li>
                  <li>Select regions of audio to redact (mute or tone)</li>
                  <li>Visual waveform for precise editing</li>
                  <li>Export redacted audio files</li>
                  <li>All data stored locally in your browser</li>
                </ul>
              </div>
            </div>

            <div className="sticky bottom-0 bg-background border-t px-6 py-4">
              <Button
                onClick={() => setShowPrivacyInfo(false)}
                className="w-full"
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane - Media Library */}
        <div
          className="flex-shrink-0"
          style={{ width: `${leftPanelWidth}px` }}
          suppressHydrationWarning
        >
          <MediaLibrary />
        </div>

        {/* Vertical Divider */}
        <ResizableDivider direction="vertical" onResize={handleLeftPanelResize} />

        {/* Middle/Right Panes - Timeline and Editor */}
        <div className="flex-1 flex flex-col overflow-hidden" style={{ width: 0 }}>
          {/* Timeline Pane */}
          <div
            className="overflow-hidden"
            style={{ height: `${timelinePanelHeight}px` }}
            suppressHydrationWarning
          >
            <Timeline />
          </div>

          {/* Horizontal Divider */}
          <ResizableDivider direction="horizontal" onResize={handleTimelinePanelResize} />

          {/* Bottom Pane - Media Editor */}
          <div className="flex-1 overflow-hidden" style={{ height: 0 }}>
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
