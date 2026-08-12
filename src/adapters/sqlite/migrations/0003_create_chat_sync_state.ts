import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("chat_sync_state")
    .addColumn("chat_id", "text", (col) =>
      col.primaryKey().references("telegram_chats.telegram_id").onDelete("cascade"),
    )
    .addColumn("newest_seen_message_id", "integer")
    .addColumn("oldest_backfilled_message_id", "integer")
    .addColumn("backfill_completed_at", "integer")
    .addColumn("last_rescanned_at", "integer")
    .addColumn("last_error", "text")
    .addColumn("last_error_at", "integer")
    .addColumn("created_at", "integer", (col) => col.notNull())
    .addColumn("updated_at", "integer", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("chat_sync_state").execute();
}
