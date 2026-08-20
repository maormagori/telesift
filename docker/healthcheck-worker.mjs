import { readHeartbeatLockFreshness } from "../dist/platform/singleton-lock/heartbeat-lock.js";

const lockPath = process.argv[2];
const fresh = await readHeartbeatLockFreshness(lockPath);
process.exit(fresh ? 0 : 1);
