import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Clock } from "../time/clock.js";
import { acquireHeartbeatLock, LockHeldError, readHeartbeatLockFreshness } from "./heartbeat-lock.js";

function fakeClock(startAt: number): Clock & { advance(ms: number): void } {
  let current = startAt;
  return {
    now: () => current,
    advance(ms: number) {
      current += ms;
    },
  };
}

describe("heartbeat-lock", () => {
  let dir: string;
  let lockPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "telesift-lock-"));
    lockPath = path.join(dir, "telegram-service.lock");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("acquires the lock when no lock file exists", async () => {
    const clock = fakeClock(0);
    const lock = await acquireHeartbeatLock(lockPath, clock);
    await lock.release();
  });

  it("refuses to acquire while the existing lock is fresh", async () => {
    const clock = fakeClock(0);
    const holder = await acquireHeartbeatLock(lockPath, clock);

    clock.advance(5000);
    await expect(acquireHeartbeatLock(lockPath, clock)).rejects.toThrow(LockHeldError);

    await holder.release();
  });

  it("reclaims the lock once the existing heartbeat is stale", async () => {
    const clock = fakeClock(0);
    const holder = await acquireHeartbeatLock(lockPath, clock);

    clock.advance(20_001);
    const reclaimed = await acquireHeartbeatLock(lockPath, clock);

    await reclaimed.release();
    await holder.release();
  });

  it("removes the lock file on release, allowing immediate re-acquisition", async () => {
    const clock = fakeClock(0);
    const first = await acquireHeartbeatLock(lockPath, clock);
    await first.release();

    const second = await acquireHeartbeatLock(lockPath, clock);
    await second.release();
  });

  it("readHeartbeatLockFreshness returns false when the lock file doesn't exist", async () => {
    expect(await readHeartbeatLockFreshness(lockPath, fakeClock(0))).toBe(false);
  });

  it("readHeartbeatLockFreshness returns true immediately after acquiring the lock", async () => {
    const clock = fakeClock(0);
    const holder = await acquireHeartbeatLock(lockPath, clock);

    expect(await readHeartbeatLockFreshness(lockPath, clock)).toBe(true);

    await holder.release();
  });

  it("readHeartbeatLockFreshness returns false once the heartbeat goes stale", async () => {
    const clock = fakeClock(0);
    const holder = await acquireHeartbeatLock(lockPath, clock);

    clock.advance(20_001);
    expect(await readHeartbeatLockFreshness(lockPath, clock)).toBe(false);

    await holder.release();
  });
});
