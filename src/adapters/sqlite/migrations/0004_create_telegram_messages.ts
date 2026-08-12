import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("telegram_messages")
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("chat_id", "text", (col) =>
      col.notNull().references("telegram_chats.telegram_id").onDelete("cascade"),
    )
    .addColumn("telegram_message_id", "integer", (col) => col.notNull())
    .addColumn("text", "text")
    .addColumn("reply_to_message_id", "integer")
    .addColumn("media_group_id", "text")
    .addColumn("source_date", "integer", (col) => col.notNull())
    .addColumn("source_edited_at", "integer")
    .addColumn("fingerprint", "text", (col) => col.notNull())
    .addColumn("deleted_at", "integer")
    .addColumn("created_at", "integer", (col) => col.notNull())
    .addColumn("updated_at", "integer", (col) => col.notNull())
    .addUniqueConstraint("telegram_messages_chat_id_telegram_message_id_unique", [
      "chat_id",
      "telegram_message_id",
    ])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("telegram_messages").execute();
}
