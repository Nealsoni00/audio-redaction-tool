import Dexie, { Table } from 'dexie';
import { MediaFile, TimelineItem } from './types';

export interface StoredMediaFile extends Omit<MediaFile, 'file'> {
  fileData: ArrayBuffer;
  fileName: string;
  fileType: string;
}

export class AudioRedactionDB extends Dexie {
  mediaFiles!: Table<StoredMediaFile, string>;
  timelineItems!: Table<TimelineItem, string>;

  constructor() {
    super('AudioRedactionDB');

    this.version(1).stores({
      mediaFiles: 'id, name, createdAt',
      timelineItems: 'id, mediaId, startTime',
    });
  }
}

export const db = new AudioRedactionDB();

// Helper functions to convert between File and ArrayBuffer
export async function fileToStoredMediaFile(mediaFile: MediaFile): Promise<StoredMediaFile> {
  const arrayBuffer = await mediaFile.file.arrayBuffer();
  return {
    id: mediaFile.id,
    name: mediaFile.name,
    duration: mediaFile.duration,
    type: mediaFile.type,
    createdAt: mediaFile.createdAt,
    fileData: arrayBuffer,
    fileName: mediaFile.file.name,
    fileType: mediaFile.file.type,
  };
}

export function storedMediaFileToMediaFile(stored: StoredMediaFile): MediaFile {
  const file = new File([stored.fileData], stored.fileName, { type: stored.fileType });
  return {
    id: stored.id,
    name: stored.name,
    file,
    duration: stored.duration,
    type: stored.type,
    createdAt: stored.createdAt,
  };
}
