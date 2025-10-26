export interface MediaFile {
  id: string;
  name: string;
  file: File;
  duration: number;
  type: 'audio' | 'video';
  createdAt: number;
}

export interface TimelineItem {
  id: string;
  mediaId: string;
  startTime: number; // Position on the timeline in seconds
  duration: number;
  clips: AudioClip[];
  transcript?: Transcript;
}

export type RedactionMode = 'tone' | 'silence';

export interface AudioClip {
  id: string;
  startTime: number; // Relative to the original media file
  endTime: number;
  muted: boolean;
  redactionMode?: RedactionMode; // Override for this specific clip (if undefined, uses global default)
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

export interface TranscriptSegment {
  words: TranscriptWord[];
  start: number;
  end: number;
}

export interface Transcript {
  segments: TranscriptSegment[];
  fullText: string;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}

export interface AppState {
  mediaFiles: MediaFile[];
  timelineItems: TimelineItem[];
  selectedTimelineItemId: string | null;
  playbackState: PlaybackState;
}
