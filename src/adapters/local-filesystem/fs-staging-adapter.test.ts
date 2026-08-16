import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough, Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StagingFilesystemPort } from "../../modules/downloads/ports/staging-filesystem-port.js";
import { createFsStagingAdapter } from "./fs-staging-adapter.js";

describe("fs staging adapter", () => {
  let dir: string;
  let adapter: StagingFilesystemPort;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-staging-"));
    adapter = createFsStagingAdapter(dir);
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("buildPath sanitizes untrusted file names into the staging directory", () => {
    expect(adapter.buildPath(1, "../../etc/passwd")).toBe(path.join(dir, "1-passwd"));
    expect(adapter.buildPath(2, "a/b\\c.mp4")).toBe(path.join(dir, "2-c.mp4"));
  });

  it("existingBytes is 0 for a file that doesn't exist yet", async () => {
    expect(await adapter.existingBytes(path.join(dir, "missing.bin"))).toBe(0);
  });

  it("existingBytes reports the size of a file already on disk", async () => {
    const filePath = path.join(dir, "existing.bin");
    await writeFile(filePath, Buffer.from("hello"));
    expect(await adapter.existingBytes(filePath)).toBe(5);
  });

  it("writeStream writes the full source to disk and reports progress", async () => {
    const filePath = path.join(dir, "out.bin");
    const onProgress = vi.fn();
    const controller = new AbortController();

    const result = await adapter.writeStream({
      source: Readable.from([Buffer.from("hello "), Buffer.from("world")]),
      path: filePath,
      resumeFromBytes: 0,
      signal: controller.signal,
      onProgress,
    });

    expect(result).toEqual({ bytesWritten: 11, aborted: false });
    expect((await readFile(filePath)).toString()).toBe("hello world");
    expect(onProgress).toHaveBeenCalledWith(6);
    expect(onProgress).toHaveBeenCalledWith(11);
  });

  it("writeStream resumes from an existing byte offset by appending", async () => {
    const filePath = path.join(dir, "resume.bin");
    await writeFile(filePath, Buffer.from("hello "));
    const controller = new AbortController();

    const result = await adapter.writeStream({
      source: Readable.from([Buffer.from("world")]),
      path: filePath,
      resumeFromBytes: 6,
      signal: controller.signal,
      onProgress: () => {},
    });

    expect(result).toEqual({ bytesWritten: 11, aborted: false });
    expect((await readFile(filePath)).toString()).toBe("hello world");
  });

  it("aborts mid-transfer when the signal fires, destroying the source and stopping further writes", async () => {
    const filePath = path.join(dir, "partial.bin");
    const source = new PassThrough();
    source.on("error", () => {});
    const controller = new AbortController();
    const onProgress = vi.fn();

    const resultPromise = adapter.writeStream({
      source,
      path: filePath,
      resumeFromBytes: 0,
      signal: controller.signal,
      onProgress,
    });

    source.write(Buffer.from("hello"));
    await vi.waitFor(() => expect(onProgress).toHaveBeenCalledWith(5));
    controller.abort();
    source.write(Buffer.from("world"));

    const result = await resultPromise;

    expect(result.aborted).toBe(true);
    expect(result.bytesWritten).toBe(5);
    expect(source.destroyed).toBe(true);
    expect((await readFile(filePath)).toString()).toBe("hello");
  });

  it("writeStream is a no-op when the signal is already aborted", async () => {
    const filePath = path.join(dir, "already-aborted.bin");
    const controller = new AbortController();
    controller.abort();

    const result = await adapter.writeStream({
      source: Readable.from([Buffer.from("should not be written")]),
      path: filePath,
      resumeFromBytes: 3,
      signal: controller.signal,
      onProgress: () => {},
    });

    expect(result).toEqual({ bytesWritten: 3, aborted: true });
  });

  it("deleteFile removes a file, and is a no-op if it doesn't exist", async () => {
    const filePath = path.join(dir, "to-delete.bin");
    await writeFile(filePath, Buffer.from("x"));

    await adapter.deleteFile(filePath);
    await expect(readFile(filePath)).rejects.toThrow();
    await expect(adapter.deleteFile(filePath)).resolves.toBeUndefined();
  });
});
