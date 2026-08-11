import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Clock } from "../time/clock.js";
import { systemClock } from "../time/clock.js";

const HEARTBEAT_INTERVAL_MS = 5000;
const STALE_THRESHOLD_MS = 20000;

interface LockRecord {
  instanceId: string;
  startedAt: number;
  heartbeatAt: number;
}

export class LockHeldError extends Error {
  constructor(holder: LockRecord) {
    super(
      `telegram-service lock is held by instance ${holder.instanceId}, last heartbeat at ${new Date(holder.heartbeatAt).toISOString()}`,
    );
    this.name = "LockHeldError";
  }
}

export interface HeartbeatLock {
  release(): Promise<void>;
}

export async function acquireHeartbeatLock(
  lockPath: string,
  clock: Clock = systemClock,
): Promise<HeartbeatLock> {
  await mkdir(path.dirname(lockPath), { recursive: true });

  const record: LockRecord = {
    instanceId: randomUUID(),
    startedAt: clock.now(),
    heartbeatAt: clock.now(),
  };

  await createOrReclaim(lockPath, record, clock);

  const interval = setInterval(() => {
    record.heartbeatAt = clock.now();
    void writeFile(lockPath, JSON.stringify(record), "utf8");
  }, HEARTBEAT_INTERVAL_MS);
  interval.unref();

  return {
    async release() {
      clearInterval(interval);
      await unlink(lockPath).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      });
    },
  };
}

async function createOrReclaim(lockPath: string, record: LockRecord, clock: Clock): Promise<void> {
  const created = await tryCreate(lockPath, record);
  if (created) return;

  const existing = await readLockRecord(lockPath);
  if (existing && clock.now() - existing.heartbeatAt < STALE_THRESHOLD_MS) {
    throw new LockHeldError(existing);
  }

  const tempPath = `${lockPath}.${record.instanceId}.tmp`;
  await writeFile(tempPath, JSON.stringify(record), "utf8");
  await rename(tempPath, lockPath);
}

async function tryCreate(lockPath: string, record: LockRecord): Promise<boolean> {
  try {
    const handle = await open(lockPath, "wx");
    try {
      await handle.writeFile(JSON.stringify(record), "utf8");
    } finally {
      await handle.close();
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

async function readLockRecord(lockPath: string): Promise<LockRecord | null> {
  try {
    const raw = await readFile(lockPath, "utf8");
    return JSON.parse(raw) as LockRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
