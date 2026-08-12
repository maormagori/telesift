import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("channels")
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("identifier_type", "text", (col) =>
      col.notNull().check(sql`identifier_type in ('telegram_id', 'username')`),
    )
    .addColumn("identifier_value", "text", (col) => col.notNull())
    .addColumn("enabled", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("created_at", "integer", (col) => col.notNull())
    .addColumn("updated_at", "integer", (col) => col.notNull())
    .addUniqueConstraint("channels_identifier_type_identifier_value_unique", [
      "identifier_type",
      "identifier_value",
    ])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("channels").execute();
}
