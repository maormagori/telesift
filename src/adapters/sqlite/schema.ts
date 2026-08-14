import type { Generated } from "kysely";
import type { ChannelIdentifier } from "../../modules/ingestion/domain/channel.js";
import type { TelegramChatType } from "../../modules/ingestion/domain/telegram-chat.js";
import type { MediaAvailability } from "../../modules/ingestion/domain/media-asset.js";
import type { MediaProcessingJobStatus } from "../../modules/extraction/domain/media-processing-job.js";
import type { ContextGroupMessageRole, ContextGroupStatus } from "../../modules/context/domain/context-group.js";
import type { ExtractionRunStatus } from "../../modules/extraction/domain/extraction-run.js";
import type { SeriesAliasSource } from "../../modules/catalog/domain/series-alias.js";
import type { ReleaseReviewState } from "../../modules/catalog/domain/release.js";
import type { ReleaseRevisionChangeSource } from "../../modules/catalog/domain/release-revision.js";

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

export interface ContextGroupsTable {
  id: Generated<number>;
  media_asset_id: number;
  status: ContextGroupStatus;
  input_fingerprint: string;
  quiet_period_deadline: number | null;
  created_at: number;
  updated_at: number;
}

export interface ContextGroupMessagesTable {
  id: Generated<number>;
  context_group_id: number;
  message_id: number;
  role: ContextGroupMessageRole;
  relative_order: number;
  created_at: number;
}

export interface ExtractionRunsTable {
  id: Generated<number>;
  context_group_id: number;
  input_fingerprint: string;
  pipeline_version: string;
  prompt_version: string;
  model_version: string;
  status: ExtractionRunStatus;
  is_tv_episode: number | null;
  result_json: string | null;
  error: string | null;
  created_at: number;
}

export interface SeriesTable {
  id: Generated<number>;
  canonical_title: string;
  original_language: string | null;
  created_at: number;
  updated_at: number;
}

export interface SeriesAliasesTable {
  id: Generated<number>;
  series_id: number;
  alias_normalized: string;
  alias_original: string;
  language: string | null;
  source: SeriesAliasSource;
  created_at: number;
}

export interface ReleasesTable {
  id: Generated<number>;
  media_asset_id: number;
  series_id: number | null;
  extraction_run_id: number;
  season: number | null;
  episode: number | null;
  resolution: string | null;
  source: string | null;
  codec: string | null;
  language: string | null;
  display_title: string;
  review_state: Generated<ReleaseReviewState>;
  manually_verified: Generated<number>;
  manually_verified_at: number | null;
  created_at: number;
  updated_at: number;
}

export interface ReleaseRevisionsTable {
  id: Generated<number>;
  release_id: number;
  extraction_run_id: number | null;
  change_source: ReleaseRevisionChangeSource;
  before_json: string;
  after_json: string;
  actor: string;
  created_at: number;
}

export interface DB {
  channels: ChannelsTable;
  telegram_chats: TelegramChatsTable;
  chat_sync_state: ChatSyncStateTable;
  telegram_messages: TelegramMessagesTable;
  media_assets: MediaAssetsTable;
  media_processing_jobs: MediaProcessingJobsTable;
  context_groups: ContextGroupsTable;
  context_group_messages: ContextGroupMessagesTable;
  extraction_runs: ExtractionRunsTable;
  series: SeriesTable;
  series_aliases: SeriesAliasesTable;
  releases: ReleasesTable;
  release_revisions: ReleaseRevisionsTable;
}
