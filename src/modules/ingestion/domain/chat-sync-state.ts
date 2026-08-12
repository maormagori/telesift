export interface ChatSyncState {
  chatId: string;
  newestSeenMessageId: number | null;
  oldestBackfilledMessageId: number | null;
  backfillCompletedAt: number | null;
  lastRescannedAt: number | null;
  lastError: string | null;
  lastErrorAt: number | null;
  createdAt: number;
  updatedAt: number;
}
