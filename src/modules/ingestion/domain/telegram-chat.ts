export type TelegramChatType = "channel" | "group" | "user";

export interface TelegramChat {
  telegramId: string;
  title: string;
  type: TelegramChatType;
  username: string | null;
  createdAt: number;
  updatedAt: number;
}
