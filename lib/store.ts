import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import { MediaFile, TimelineItem, AudioClip, Transcript, PlaybackState, RedactionMode, Detection } from './types';
import { db, fileToStoredMediaFile, storedMediaFileToMediaFile } from './db';

interface Store {
  // State
  mediaFiles: MediaFile[];
  timelineItems: TimelineItem[];
  selectedTimelineItemId: string | null;
  playbackState: PlaybackState;
  isLoading: boolean;
  wavesurferInstance: any | null;
  globalRedactionMode: RedactionMode;

  // Actions - Media Library
  addMediaFile: (file: File) => Promise<void>;
  removeMediaFile: (id: string) => Promise<void>;
  loadMediaFiles: () => Promise<void>;

  // Actions - Timeline
  addToTimeline: (mediaId: string) => Promise<string | undefined>;
  removeFromTimeline: (id: string) => Promise<void>;
  selectTimelineItem: (id: string | null) => void;
  updateTimelineItem: (id: string, updates: Partial<TimelineItem>) => Promise<void>;

  // Actions - Audio Editing
  addClip: (timelineItemId: string, clip: AudioClip) => Promise<void>;
  removeClip: (timelineItemId: string, clipId: string) => Promise<void>;
  updateClip: (timelineItemId: string, clipId: string, updates: Partial<AudioClip>) => Promise<void>;
  toggleClipMute: (timelineItemId: string, clipId: string) => Promise<void>;
  batchUpdateClips: (timelineItemId: string, clipsToRemove: string[], clipsToAdd: AudioClip[]) => Promise<void>;

  // Actions - Transcript
  setTranscript: (timelineItemId: string, transcript: Transcript) => Promise<void>;

  // Actions - Detections
  setDetections: (timelineItemId: string, detections: Detection[], redactedKeys: string[]) => Promise<void>;

  // Actions - Playback
  setPlaybackState: (state: Partial<PlaybackState>) => void;
  setWavesurferInstance: (instance: any) => void;

  // Actions - Redaction
  setGlobalRedactionMode: (mode: RedactionMode) => void;
}

export const useStore = create<Store>((set, get) => ({
  // Initial state
  mediaFiles: [],
  timelineItems: [],
  selectedTimelineItemId: null,
  playbackState: {
    isPlaying: false,
    currentTime: 0,
    duration: 0,
  },
  isLoading: false,
  wavesurferInstance: null,
  globalRedactionMode: 'silence',

  // Media Library Actions
  addMediaFile: async (file: File) => {
    const audio = document.createElement('audio');
    audio.src = URL.createObjectURL(file);

    // Wait for metadata to load to get duration
    await new Promise((resolve) => {
      audio.onloadedmetadata = resolve;
    });

    const mediaFile: MediaFile = {
      id: uuidv4(),
      name: file.name,
      file,
      duration: audio.duration,
      type: file.type.startsWith('audio/') ? 'audio' : 'video',
      createdAt: Date.now(),
    };

    URL.revokeObjectURL(audio.src);

    // Save to IndexedDB
    const storedFile = await fileToStoredMediaFile(mediaFile);
    await db.mediaFiles.add(storedFile);

    set((state) => ({
      mediaFiles: [...state.mediaFiles, mediaFile],
    }));
  },

  removeMediaFile: async (id: string) => {
    await db.mediaFiles.delete(id);
    set((state) => ({
      mediaFiles: state.mediaFiles.filter((f) => f.id !== id),
    }));
  },

  loadMediaFiles: async () => {
    set({ isLoading: true });
    try {
      const storedFiles = await db.mediaFiles.toArray();
      const mediaFiles = storedFiles.map(storedMediaFileToMediaFile);

      const timelineItems = await db.timelineItems.toArray();

      set({
        mediaFiles,
        timelineItems,
        isLoading: false,
      });
    } catch (error) {
      console.error('Failed to load media files:', error);
      set({ isLoading: false });
    }
  },

  // Timeline Actions
  addToTimeline: async (mediaId: string) => {
    const mediaFile = get().mediaFiles.find((f) => f.id === mediaId);
    if (!mediaFile) return undefined;

    const timelineItem: TimelineItem = {
      id: uuidv4(),
      mediaId,
      startTime: 0,
      duration: mediaFile.duration,
      clips: [
        {
          id: uuidv4(),
          startTime: 0,
          endTime: mediaFile.duration,
          muted: false,
        },
      ],
    };

    await db.timelineItems.add(timelineItem);

    set((state) => ({
      timelineItems: [...state.timelineItems, timelineItem],
    }));

    return timelineItem.id;
  },

  removeFromTimeline: async (id: string) => {
    await db.timelineItems.delete(id);
    set((state) => ({
      timelineItems: state.timelineItems.filter((item) => item.id !== id),
      selectedTimelineItemId:
        state.selectedTimelineItemId === id ? null : state.selectedTimelineItemId,
    }));
  },

  selectTimelineItem: (id: string | null) => {
    set({ selectedTimelineItemId: id });
  },

  updateTimelineItem: async (id: string, updates: Partial<TimelineItem>) => {
    await db.timelineItems.update(id, updates);

    set((state) => ({
      timelineItems: state.timelineItems.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    }));
  },

  // Audio Editing Actions
  addClip: async (timelineItemId: string, clip: AudioClip) => {
    const item = get().timelineItems.find((item) => item.id === timelineItemId);
    if (!item) return;

    const updatedClips = [...item.clips, clip];
    await get().updateTimelineItem(timelineItemId, { clips: updatedClips });
  },

  removeClip: async (timelineItemId: string, clipId: string) => {
    const item = get().timelineItems.find((item) => item.id === timelineItemId);
    if (!item) return;

    const updatedClips = item.clips.filter((clip) => clip.id !== clipId);
    await get().updateTimelineItem(timelineItemId, { clips: updatedClips });
  },

  batchUpdateClips: async (timelineItemId: string, clipsToRemove: string[], clipsToAdd: AudioClip[]) => {
    const item = get().timelineItems.find((item) => item.id === timelineItemId);
    if (!item) return;

    // Remove specified clips
    let updatedClips = item.clips.filter((clip) => !clipsToRemove.includes(clip.id));

    // Add new clips
    updatedClips = [...updatedClips, ...clipsToAdd];

    // Single update operation
    await get().updateTimelineItem(timelineItemId, { clips: updatedClips });
  },

  updateClip: async (
    timelineItemId: string,
    clipId: string,
    updates: Partial<AudioClip>
  ) => {
    const item = get().timelineItems.find((item) => item.id === timelineItemId);
    if (!item) return;

    const updatedClips = item.clips.map((clip) =>
      clip.id === clipId ? { ...clip, ...updates } : clip
    );
    await get().updateTimelineItem(timelineItemId, { clips: updatedClips });
  },

  toggleClipMute: async (timelineItemId: string, clipId: string) => {
    const item = get().timelineItems.find((item) => item.id === timelineItemId);
    if (!item) return;

    const clip = item.clips.find((c) => c.id === clipId);
    if (!clip) return;

    await get().updateClip(timelineItemId, clipId, { muted: !clip.muted });
  },

  // Transcript Actions
  setTranscript: async (timelineItemId: string, transcript: Transcript) => {
    await get().updateTimelineItem(timelineItemId, { transcript });
  },

  // Detection Actions
  setDetections: async (timelineItemId: string, detections: Detection[], redactedKeys: string[]) => {
    await get().updateTimelineItem(timelineItemId, {
      detections,
      redactedDetectionKeys: redactedKeys,
    });
  },

  // Playback Actions
  setPlaybackState: (state: Partial<PlaybackState>) => {
    set((prev) => ({
      playbackState: { ...prev.playbackState, ...state },
    }));
  },

  setWavesurferInstance: (instance: any) => {
    set({ wavesurferInstance: instance });
  },

  // Redaction Actions
  setGlobalRedactionMode: (mode: RedactionMode) => {
    set({ globalRedactionMode: mode });
  },
}));
