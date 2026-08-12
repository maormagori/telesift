import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("media_assets")
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("message_id", "integer", (col) =>
      col.notNull().unique().references("telegram_messages.id").onDelete("cascade"),
    )
    .addColumn("file_name", "text")
    .addColumn("mime_type", "text")
    .addColumn("size_bytes", "integer")
    .addColumn("duration_seconds", "real")
    .addColumn("width", "integer")
    .addColumn("height", "integer")
    .addColumn("availability", "text", (col) =>
      col.notNull().defaultTo("unknown").check(sql`availability in ('available', 'unknown', 'unavailable')`),
    )
    .addColumn("last_verified_at", "integer")
    .addColumn("unavailable_at", "integer")
    .addColumn("created_at", "integer", (col) => col.notNull())
    .addColumn("updated_at", "integer", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("media_assets").execute();
}
