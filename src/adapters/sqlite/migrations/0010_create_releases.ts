import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("releases")
    .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
    .addColumn("media_asset_id", "integer", (col) =>
      col.notNull().unique().references("media_assets.id").onDelete("cascade"),
    )
    .addColumn("series_id", "integer", (col) => col.references("series.id").onDelete("set null"))
    .addColumn("extraction_run_id", "integer", (col) => col.notNull().references("extraction_runs.id"))
    .addColumn("season", "integer")
    .addColumn("episode", "integer")
    .addColumn("resolution", "text")
    .addColumn("source", "text")
    .addColumn("codec", "text")
    .addColumn("language", "text")
    .addColumn("display_title", "text", (col) => col.notNull())
    .addColumn("review_state", "text", (col) =>
      col
        .notNull()
        .defaultTo("pending_review")
        .check(sql`review_state in ('pending_review', 'approved', 'rejected')`),
    )
    .addColumn("manually_verified", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("manually_verified_at", "integer")
    .addColumn("created_at", "integer", (col) => col.notNull())
    .addColumn("updated_at", "integer", (col) => col.notNull())
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("releases").execute();
}
