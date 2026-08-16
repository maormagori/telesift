import type { Readable } from "node:stream";

export interface WriteStreamInput {
  source: Readable;
  path: string;
  /** Byte offset already on disk to resume from (0 for a fresh transfer). */
  resumeFromBytes: number;
  signal: AbortSignal;
  onProgress: (totalBytesWritten: number) => void;
}

export interface WriteStreamResult {
  bytesWritten: number;
  aborted: boolean;
}

export interface StagingFilesystemPort {
  /** Bytes already on disk at path, or 0 if the file doesn't exist. */
  existingBytes(path: string): Promise<number>;
  buildPath(downloadId: number, fileName: string): string;
  writeStream(input: WriteStreamInput): Promise<WriteStreamResult>;
  deleteFile(path: string): Promise<void>;
}
