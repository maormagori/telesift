import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.schema
      .createTable("series")
      .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
      .addColumn("canonical_title", "text", (col) => col.notNull())
      .addColumn("original_language", "text")
      .addColumn("created_at", "integer", (col) => col.notNull())
      .addColumn("updated_at", "integer", (col) => col.notNull())
      .execute();

    await trx.schema
      .createTable("series_aliases")
      .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
      .addColumn("series_id", "integer", (col) => col.notNull().references("series.id").onDelete("cascade"))
      .addColumn("alias_normalized", "text", (col) => col.notNull())
      .addColumn("alias_original", "text", (col) => col.notNull())
      .addColumn("language", "text")
      .addColumn("source", "text", (col) => col.notNull().check(sql`source in ('manual', 'extraction')`))
      .addColumn("created_at", "integer", (col) => col.notNull())
      .addUniqueConstraint("series_aliases_series_id_alias_normalized_unique", ["series_id", "alias_normalized"])
      .execute();

    await trx.schema.createIndex("series_aliases_alias_normalized_idx").on("series_aliases").column("alias_normalized").execute();
  });
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("series_aliases").execute();
  await db.schema.dropTable("series").execute();
}
