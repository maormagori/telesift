import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.schema
      .createTable("extraction_runs")
      .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
      .addColumn("context_group_id", "integer", (col) =>
        col.notNull().references("context_groups.id").onDelete("cascade"),
      )
      .addColumn("input_fingerprint", "text", (col) => col.notNull())
      .addColumn("pipeline_version", "text", (col) => col.notNull())
      .addColumn("prompt_version", "text", (col) => col.notNull())
      .addColumn("model_version", "text", (col) => col.notNull())
      .addColumn("status", "text", (col) => col.notNull().check(sql`status in ('succeeded', 'failed')`))
      .addColumn("is_tv_episode", "integer")
      .addColumn("result_json", "text")
      .addColumn("error", "text")
      .addColumn("created_at", "integer", (col) => col.notNull())
      .addUniqueConstraint("extraction_runs_dedup_key_unique", [
        "context_group_id",
        "input_fingerprint",
        "pipeline_version",
        "prompt_version",
        "model_version",
      ])
      .execute();
  });
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("extraction_runs").execute();
}
