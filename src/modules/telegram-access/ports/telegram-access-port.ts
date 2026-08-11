import type { Readable } from "node:stream";
import type {
  ChatSummary,
  ConnectionStatus,
  GetMessagesOptions,
  MediaDescriptor,
  MessageSummary,
} from "./models.js";

export class ChatNotAccessibleError extends Error {
  constructor(
    public readonly chatId: string,
    options?: { cause?: unknown },
  ) {
    super(`Chat not accessible: ${chatId}`, options);
    this.name = "ChatNotAccessibleError";
  }
}

export interface MediaStream {
  descriptor: MediaDescriptor;
  stream: Readable;
}

export interface TelegramAccessPort {
  getStatus(): Promise<ConnectionStatus>;
  listChats(): Promise<ChatSummary[]>;
  getMessages(chatId: string, options: GetMessagesOptions): Promise<MessageSummary[]>;
  getMessage(chatId: string, messageId: number): Promise<MessageSummary | null>;
  getMediaStream(chatId: string, messageId: number): Promise<MediaStream | null>;
}
