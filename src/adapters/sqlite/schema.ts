import type { Generated } from "kysely";
import type { ChannelIdentifier } from "../../modules/ingestion/domain/channel.js";
import type { TelegramChatType } from "../../modules/ingestion/domain/telegram-chat.js";
import type { MediaAvailability } from "../../modules/ingestion/domain/media-asset.js";
import type { MediaProcessingJobStatus } from "../../modules/extraction/domain/media-processing-job.js";

export interface ChannelsTable {
  id: Generated<number>;
  identifier_type: ChannelIdentifier["type"];
  identifier_value: string;
  enabled: Generated<number>;
  created_at: number;
  updated_at: number;
}

export interface TelegramChatsTable {
  telegram_id: string;
  title: string;
  type: TelegramChatType;
  username: string | null;
  created_at: number;
  updated_at: number;
}

export interface ChatSyncStateTable {
  chat_id: string;
  newest_seen_message_id: number | null;
  oldest_backfilled_message_id: number | null;
  backfill_completed_at: number | null;
  last_rescanned_at: number | null;
  last_error: string | null;
  last_error_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface TelegramMessagesTable {
  id: Generated<number>;
  chat_id: string;
  telegram_message_id: number;
  text: string | null;
  reply_to_message_id: number | null;
  media_group_id: string | null;
  source_date: number;
  source_edited_at: number | null;
  fingerprint: string;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface MediaAssetsTable {
  id: Generated<number>;
  message_id: number;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  availability: Generated<MediaAvailability>;
  last_verified_at: number | null;
  unavailable_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface MediaProcessingJobsTable {
  id: Generated<number>;
  media_asset_id: number;
  input_fingerprint: string;
  status: Generated<MediaProcessingJobStatus>;
  available_at: number;
  worker_id: string | null;
  lease_expires_at: number | null;
  attempts: Generated<number>;
  last_error: string | null;
  last_error_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface DB {
  channels: ChannelsTable;
  telegram_chats: TelegramChatsTable;
  chat_sync_state: ChatSyncStateTable;
  telegram_messages: TelegramMessagesTable;
  media_assets: MediaAssetsTable;
  media_processing_jobs: MediaProcessingJobsTable;
}
