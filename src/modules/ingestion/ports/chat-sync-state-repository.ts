import type { ChatSyncState } from "../domain/chat-sync-state.js";

export interface ChatSyncStateRepository {
  get(chatId: string): Promise<ChatSyncState | null>;
  /** Creates the row if absent. Moves newestSeenMessageId forward only (no-op if not greater than the stored value). */
  advanceIncrementalCursor(chatId: string, newestSeenMessageId: number, now: number): Promise<ChatSyncState>;
  /** Creates the row if absent. Moves oldestBackfilledMessageId backward only (no-op if not smaller than the stored value). */
  advanceBackfillCursor(chatId: string, oldestBackfilledMessageId: number, now: number): Promise<ChatSyncState>;
  markBackfillCompleted(chatId: string, completedAt: number): Promise<ChatSyncState>;
  recordRescan(chatId: string, rescannedAt: number): Promise<ChatSyncState>;
  recordError(chatId: string, error: string, at: number): Promise<ChatSyncState>;
}
