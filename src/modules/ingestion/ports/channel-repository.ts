import type { Channel, ChannelIdentifier } from "../domain/channel.js";

export interface ChannelRepository {
  /** Idempotent: returns the existing row unchanged if the identifier is already present. */
  add(identifier: ChannelIdentifier): Promise<Channel>;
  /** Throws ChannelNotFoundError if no channel matches the identifier. */
  setEnabled(identifier: ChannelIdentifier, enabled: boolean): Promise<Channel>;
  list(): Promise<Channel[]>;
}
