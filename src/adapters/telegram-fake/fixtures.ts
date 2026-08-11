import type { ChatSummary, MediaDescriptor, MessageSummary } from "../../modules/telegram-access/ports/models.js";

export interface FakeMediaAsset {
  descriptor: MediaDescriptor;
  bytes: Buffer;
}

export interface FakeChatFixture {
  chat: ChatSummary;
  messages: MessageSummary[];
  media: Record<number, FakeMediaAsset>;
}

const CHANNEL_1_MESSAGE_102_BYTES = Buffer.from("synthetic-fake-video-bytes-for-message-102");
const CHANNEL_1_MESSAGE_102_DESCRIPTOR: MediaDescriptor = {
  fileName: "Fauda.S04E03.1080p.WEB-DL.mkv",
  mimeType: "video/x-matroska",
  sizeBytes: CHANNEL_1_MESSAGE_102_BYTES.length,
  durationSeconds: 2_640,
  width: 1920,
  height: 1080,
};

const HEBREW_CHANNEL: FakeChatFixture = {
  chat: {
    id: "channel-1",
    title: "ערוץ הבדיקות",
    type: "channel",
    username: "test_channel_he",
  },
  messages: [
    {
      chatId: "channel-1",
      messageId: 101,
      date: 1_700_000_000,
      text: "פרק חדש עולה בקרוב!",
      replyToMessageId: null,
      mediaGroupId: null,
      media: null,
    },
    {
      chatId: "channel-1",
      messageId: 102,
      date: 1_700_000_100,
      text: "Fauda.S04E03.1080p.WEB-DL",
      replyToMessageId: null,
      mediaGroupId: null,
      media: CHANNEL_1_MESSAGE_102_DESCRIPTOR,
    },
  ],
  media: {
    102: {
      descriptor: CHANNEL_1_MESSAGE_102_DESCRIPTOR,
      bytes: CHANNEL_1_MESSAGE_102_BYTES,
    },
  },
};

const GROUP_2_MESSAGE_202_BYTES = Buffer.from("synthetic-fake-video-bytes-for-message-202");
const GROUP_2_MESSAGE_202_DESCRIPTOR: MediaDescriptor = {
  fileName: "The.Show.S01E05.720p.mp4",
  mimeType: "video/mp4",
  sizeBytes: GROUP_2_MESSAGE_202_BYTES.length,
  durationSeconds: 1_500,
  width: 1280,
  height: 720,
};

const GROUP_2_MESSAGE_203_BYTES = Buffer.from("synthetic-fake-video-bytes-for-message-203");
const GROUP_2_MESSAGE_203_DESCRIPTOR: MediaDescriptor = {
  fileName: "פרק חדש.mp4",
  mimeType: "video/mp4",
  sizeBytes: GROUP_2_MESSAGE_203_BYTES.length,
  durationSeconds: 1_200,
  width: 1280,
  height: 720,
};

const ENGLISH_GROUP: FakeChatFixture = {
  chat: {
    id: "group-2",
    title: "TV Releases Discussion",
    type: "group",
    username: null,
  },
  messages: [
    {
      chatId: "group-2",
      messageId: 201,
      date: 1_700_100_000,
      text: "New episode dropping tonight",
      replyToMessageId: null,
      mediaGroupId: null,
      media: null,
    },
    {
      chatId: "group-2",
      messageId: 202,
      date: 1_700_100_200,
      text: "The.Show.S01E05.720p.mp4",
      replyToMessageId: 201,
      mediaGroupId: null,
      media: GROUP_2_MESSAGE_202_DESCRIPTOR,
    },
    {
      chatId: "group-2",
      messageId: 203,
      date: 1_700_100_300,
      text: "פרק חדש עם שם קובץ בעברית",
      replyToMessageId: null,
      mediaGroupId: null,
      media: GROUP_2_MESSAGE_203_DESCRIPTOR,
    },
  ],
  media: {
    202: {
      descriptor: GROUP_2_MESSAGE_202_DESCRIPTOR,
      bytes: GROUP_2_MESSAGE_202_BYTES,
    },
    203: {
      descriptor: GROUP_2_MESSAGE_203_DESCRIPTOR,
      bytes: GROUP_2_MESSAGE_203_BYTES,
    },
  },
};

export const FAKE_ACCOUNT = {
  id: "fake-account-1",
  username: "telesift_dev",
  firstName: "TeleSift Dev",
};

export const FAKE_CHATS: FakeChatFixture[] = [HEBREW_CHANNEL, ENGLISH_GROUP];
