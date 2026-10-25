import type { BackfillPolicy, Channel, ChannelIdentifier } from "../domain/channel.js";

export interface ChannelRepository {
  /** Idempotent: returns the existing row unchanged (backfill policy included) if the identifier is already present. */
  add(identifier: ChannelIdentifier, backfillPolicy: BackfillPolicy): Promise<Channel>;
  /** Throws ChannelNotFoundError if no channel matches the identifier. */
  setEnabled(identifier: ChannelIdentifier, enabled: boolean): Promise<Channel>;
  list(): Promise<Channel[]>;
}
