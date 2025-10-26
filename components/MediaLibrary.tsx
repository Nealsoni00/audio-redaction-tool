'use client';

import { useCallback, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { FileAudio, Trash2, Plus, CheckCircle2 } from 'lucide-react';

export function MediaLibrary() {
  const { mediaFiles, addMediaFile, removeMediaFile, loadMediaFiles, addToTimeline, timelineItems } = useStore();

  useEffect(() => {
    loadMediaFiles();
  }, [loadMediaFiles]);

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();

      const files = Array.from(e.dataTransfer.files);
      for (const file of files) {
        if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
          await addMediaFile(file);
        }
      }
    },
    [addMediaFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleFileInput = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        await addMediaFile(file);
      }
    },
    [addMediaFile]
  );

  const handleMediaDragStart = useCallback((e: React.DragEvent<HTMLDivElement>, mediaId: string) => {
    const media = mediaFiles.find(m => m.id === mediaId);
    e.dataTransfer.setData('mediaId', mediaId);
    if (media) {
      e.dataTransfer.setData('mediaDuration', media.duration.toString());
    }
    e.dataTransfer.effectAllowed = 'copy';
  }, [mediaFiles]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col h-full border-r bg-background">
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold mb-2">Media Library</h2>
        <label htmlFor="file-input">
          <Button asChild variant="outline" className="w-full cursor-pointer">
            <div>
              <Plus className="mr-2 h-4 w-4" />
              Add Media
            </div>
          </Button>
        </label>
        <input
          id="file-input"
          type="file"
          accept="audio/*,video/*"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />
      </div>

      <div
        className="flex-1 overflow-y-auto p-4"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        {mediaFiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm text-center">
            <FileAudio className="h-12 w-12 mb-2 opacity-50" />
            <p>Drop media files here</p>
            <p className="text-xs mt-1">or use the button above</p>
          </div>
        ) : (
          <div className="space-y-4">
            {mediaFiles.map((media) => {
              const timelineCount = timelineItems.filter(item => item.mediaId === media.id).length;
              const isInTimeline = timelineCount > 0;
              
              return (
                <ContextMenu key={media.id}>
                  <ContextMenuTrigger>
                    <div
                      className={`p-4 border rounded-lg hover:bg-accent cursor-move transition-colors ${
                        isInTimeline ? 'border-primary/50 bg-primary/5' : ''
                      }`}
                      draggable
                      onDragStart={(e) => handleMediaDragStart(e, media.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <FileAudio className="h-4 w-4 flex-shrink-0" />
                            <span className="text-sm font-medium truncate">
                              {media.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-xs text-muted-foreground">
                              {formatDuration(media.duration)}
                            </div>
                            {isInTimeline && (
                              <div className="flex items-center gap-1 text-xs text-primary">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>
                                  On Timeline{timelineCount > 1 ? ` (${timelineCount}×)` : ''}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => addToTimeline(media.id)}>
                      Add to Timeline
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={() => removeMediaFile(media.id)}
                      className="text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
