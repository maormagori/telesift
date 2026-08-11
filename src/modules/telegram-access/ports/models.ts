import { z } from "zod";

export const ConnectionStatusSchema = z.object({
  connected: z.boolean(),
  account: z
    .object({
      id: z.string(),
      username: z.string().nullable(),
      firstName: z.string().nullable(),
    })
    .nullable(),
});
export type ConnectionStatus = z.infer<typeof ConnectionStatusSchema>;

export const ChatSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  type: z.enum(["channel", "group", "user"]),
  username: z.string().nullable(),
});
export type ChatSummary = z.infer<typeof ChatSummarySchema>;

export const MediaDescriptorSchema = z.object({
  fileName: z.string().nullable(),
  mimeType: z.string().nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  durationSeconds: z.number().nonnegative().nullable(),
  width: z.number().int().nonnegative().nullable(),
  height: z.number().int().nonnegative().nullable(),
});
export type MediaDescriptor = z.infer<typeof MediaDescriptorSchema>;

export const MessageSummarySchema = z.object({
  chatId: z.string(),
  messageId: z.number().int(),
  date: z.number().int(),
  text: z.string().nullable(),
  replyToMessageId: z.number().int().nullable(),
  mediaGroupId: z.string().nullable(),
  media: MediaDescriptorSchema.nullable(),
});
export type MessageSummary = z.infer<typeof MessageSummarySchema>;

export const GetMessagesOptionsSchema = z.object({
  minId: z.coerce.number().int().nonnegative().optional(),
  maxId: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});
export type GetMessagesOptions = z.infer<typeof GetMessagesOptionsSchema>;
