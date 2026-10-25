export type ChannelIdentifier =
  | { type: "telegram_id"; value: string }
  | { type: "username"; value: string };

/**
 * How much existing history a channel's first sync ingests. `maxMessages` counts back
 * from the chat's newest message; null defers to ingestion-worker's default, which is
 * all retained history when that is unset too. Ignored when `enabled` is false.
 */
export interface BackfillPolicy {
  enabled: boolean;
  maxMessages: number | null;
}

export const DEFAULT_BACKFILL_POLICY: BackfillPolicy = { enabled: true, maxMessages: null };

export interface Channel {
  id: number;
  identifier: ChannelIdentifier;
  enabled: boolean;
  backfillPolicy: BackfillPolicy;
  createdAt: number;
  updatedAt: number;
}

export class ChannelNotFoundError extends Error {
  constructor(public readonly identifier: ChannelIdentifier) {
    super(`Channel not found: ${identifier.type}=${identifier.value}`);
    this.name = "ChannelNotFoundError";
  }
}
