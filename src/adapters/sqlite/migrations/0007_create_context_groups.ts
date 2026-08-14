import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.schema
      .createTable("context_groups")
      .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
      .addColumn("media_asset_id", "integer", (col) =>
        col.notNull().unique().references("media_assets.id").onDelete("cascade"),
      )
      .addColumn("status", "text", (col) => col.notNull().check(sql`status in ('open', 'closed')`))
      .addColumn("input_fingerprint", "text", (col) => col.notNull())
      .addColumn("quiet_period_deadline", "integer")
      .addColumn("created_at", "integer", (col) => col.notNull())
      .addColumn("updated_at", "integer", (col) => col.notNull())
      .execute();

    await trx.schema
      .createTable("context_group_messages")
      .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
      .addColumn("context_group_id", "integer", (col) =>
        col.notNull().references("context_groups.id").onDelete("cascade"),
      )
      .addColumn("message_id", "integer", (col) => col.notNull().references("telegram_messages.id").onDelete("cascade"))
      .addColumn("role", "text", (col) =>
        col.notNull().check(sql`role in ('target', 'preceding', 'reply', 'album_sibling')`),
      )
      .addColumn("relative_order", "integer", (col) => col.notNull())
      .addColumn("created_at", "integer", (col) => col.notNull())
      .addUniqueConstraint("context_group_messages_context_group_id_message_id_unique", [
        "context_group_id",
        "message_id",
      ])
      .execute();
  });
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("context_group_messages").execute();
  await db.schema.dropTable("context_groups").execute();
}
