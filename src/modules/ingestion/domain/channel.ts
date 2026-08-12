export type ChannelIdentifier =
  | { type: "telegram_id"; value: string }
  | { type: "username"; value: string };

export interface Channel {
  id: number;
  identifier: ChannelIdentifier;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export class ChannelNotFoundError extends Error {
  constructor(public readonly identifier: ChannelIdentifier) {
    super(`Channel not found: ${identifier.type}=${identifier.value}`);
    this.name = "ChannelNotFoundError";
  }
}
