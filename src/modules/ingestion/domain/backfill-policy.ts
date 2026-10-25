import type { BackfillPolicy } from "./channel.js";

/** How many of a chat's newest messages a first sync backfills: 0 when backfill is disabled, null for all retained history. */
export function resolveBackfillLimit(policy: BackfillPolicy, defaultMaxMessages: number | null): number | null {
  if (!policy.enabled) return 0;
  return policy.maxMessages ?? defaultMaxMessages;
}

/**
 * Message-ID cursor a first sync starts its forward walk from so it backfills at most the
 * newest `limit` messages. Channel and supergroup message IDs are sequential per chat, so
 * deleted messages (and basic groups, whose IDs are shared across the account) make this an
 * upper bound rather than an exact count.
 */
export function backfillStartCursor(latestMessageId: number, limit: number): number {
  return Math.max(0, latestMessageId - limit);
}
