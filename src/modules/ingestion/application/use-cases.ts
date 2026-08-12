import type { Channel, ChannelIdentifier } from "../domain/channel.js";
import type { ChannelRepository } from "../ports/channel-repository.js";

export interface IngestionUseCases {
  addChannel(identifier: ChannelIdentifier): Promise<Channel>;
  enableChannel(identifier: ChannelIdentifier): Promise<Channel>;
  disableChannel(identifier: ChannelIdentifier): Promise<Channel>;
  listChannels(): Promise<Channel[]>;
}

export function createIngestionUseCases(repo: ChannelRepository): IngestionUseCases {
  return {
    addChannel: (identifier) => repo.add(identifier),
    enableChannel: (identifier) => repo.setEnabled(identifier, true),
    disableChannel: (identifier) => repo.setEnabled(identifier, false),
    listChannels: () => repo.list(),
  };
}
