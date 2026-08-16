import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import type {
  StagingFilesystemPort,
  WriteStreamInput,
  WriteStreamResult,
} from "../../modules/downloads/ports/staging-filesystem-port.js";

function sanitizeFileName(fileName: string): string {
  // fileName comes from Telegram (untrusted) — strip any path segments so it
  // can never escape the staging directory. Split on both separators
  // ourselves rather than relying on path.basename, which only recognizes
  // the host platform's separator (backslash is a plain character on POSIX).
  const segments = fileName.split(/[/\\]+/);
  const last = segments[segments.length - 1]?.trim();
  return last || "download";
}

export function createFsStagingAdapter(baseDirectory: string): StagingFilesystemPort {
  return {
    buildPath(downloadId, fileName) {
      return path.join(baseDirectory, `${downloadId}-${sanitizeFileName(fileName)}`);
    },

    async existingBytes(filePath) {
      try {
        const stats = await fs.stat(filePath);
        return stats.size;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
        throw error;
      }
    },

    async writeStream(input: WriteStreamInput): Promise<WriteStreamResult> {
      await fs.mkdir(path.dirname(input.path), { recursive: true });

      let bytesWritten = input.resumeFromBytes;
      let aborted = input.signal.aborted;
      let writeError: Error | null = null;

      const out = createWriteStream(input.path, { flags: input.resumeFromBytes > 0 ? "a" : "w" });
      out.on("error", (error: Error) => {
        writeError = error;
      });

      const onAbort = () => {
        aborted = true;
        input.source.destroy();
      };
      input.signal.addEventListener("abort", onAbort);

      try {
        if (!aborted) {
          for await (const chunk of input.source) {
            if (aborted || writeError) break;
            const buffer = chunk as Buffer;
            if (!out.write(buffer)) {
              await new Promise<void>((resolve) => out.once("drain", resolve));
            }
            bytesWritten += buffer.length;
            input.onProgress(bytesWritten);
          }
        }
      } catch (error) {
        // A destroyed source (our own abort) surfaces here as a stream error —
        // expected and not a real failure. Anything else is a real failure.
        if (!aborted) throw error;
      } finally {
        input.signal.removeEventListener("abort", onAbort);
        await new Promise<void>((resolve) => out.end(() => resolve()));
      }

      if (writeError) throw writeError;

      return { bytesWritten, aborted };
    },

    async deleteFile(filePath) {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    },
  };
}
