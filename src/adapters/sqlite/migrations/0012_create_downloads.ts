import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.schema
      .createTable("downloads")
      .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
      .addColumn("release_id", "integer", (col) => col.notNull().references("releases.id").onDelete("cascade"))
      .addColumn("client_hash", "text", (col) => col.notNull())
      .addColumn("desired_state", "text", (col) =>
        col
          .notNull()
          .defaultTo("queued")
          .check(sql`desired_state in ('queued', 'paused', 'canceled')`),
      )
      .addColumn("observed_state", "text", (col) =>
        col
          .notNull()
          .defaultTo("queued")
          .check(
            sql`observed_state in ('queued', 'verifying', 'downloading', 'paused', 'completed', 'failed', 'canceled')`,
          ),
      )
      .addColumn("progress_bytes", "integer", (col) => col.notNull().defaultTo(0))
      .addColumn("total_bytes", "integer")
      .addColumn("staging_path", "text")
      .addColumn("category", "text")
      .addColumn("worker_id", "text")
      .addColumn("lease_expires_at", "integer")
      .addColumn("attempts", "integer", (col) => col.notNull().defaultTo(0))
      .addColumn("last_error", "text")
      .addColumn("last_error_at", "integer")
      .addColumn("completed_at", "integer")
      .addColumn("created_at", "integer", (col) => col.notNull())
      .addColumn("updated_at", "integer", (col) => col.notNull())
      .execute();

    await trx.schema
      .createIndex("downloads_observed_state_lease_expires_at_idx")
      .on("downloads")
      .columns(["observed_state", "lease_expires_at"])
      .execute();

    await trx.schema.createIndex("downloads_release_id_idx").on("downloads").column("release_id").execute();

    await trx.schema.createIndex("downloads_client_hash_idx").on("downloads").column("client_hash").execute();
  });
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("downloads").execute();
}
