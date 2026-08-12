import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.schema
      .createTable("media_processing_jobs")
      .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
      .addColumn("media_asset_id", "integer", (col) =>
        col.notNull().references("media_assets.id").onDelete("cascade"),
      )
      .addColumn("input_fingerprint", "text", (col) => col.notNull())
      .addColumn("status", "text", (col) =>
        col
          .notNull()
          .defaultTo("pending")
          .check(sql`status in ('pending', 'processing', 'completed', 'failed')`),
      )
      .addColumn("available_at", "integer", (col) => col.notNull())
      .addColumn("worker_id", "text")
      .addColumn("lease_expires_at", "integer")
      .addColumn("attempts", "integer", (col) => col.notNull().defaultTo(0))
      .addColumn("last_error", "text")
      .addColumn("last_error_at", "integer")
      .addColumn("created_at", "integer", (col) => col.notNull())
      .addColumn("updated_at", "integer", (col) => col.notNull())
      .addUniqueConstraint("media_processing_jobs_media_asset_id_input_fingerprint_unique", [
        "media_asset_id",
        "input_fingerprint",
      ])
      .execute();

    await trx.schema
      .createIndex("media_processing_jobs_status_available_at_idx")
      .on("media_processing_jobs")
      .columns(["status", "available_at"])
      .execute();
  });
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("media_processing_jobs").execute();
}
