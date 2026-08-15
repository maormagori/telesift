import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await trx.schema
      .createTable("release_revisions")
      .addColumn("id", "integer", (col) => col.primaryKey().autoIncrement())
      .addColumn("release_id", "integer", (col) => col.notNull().references("releases.id").onDelete("cascade"))
      .addColumn("extraction_run_id", "integer", (col) => col.references("extraction_runs.id"))
      .addColumn("change_source", "text", (col) => col.notNull().check(sql`change_source in ('extraction', 'review')`))
      .addColumn("before_json", "text", (col) => col.notNull())
      .addColumn("after_json", "text", (col) => col.notNull())
      .addColumn("actor", "text", (col) => col.notNull())
      .addColumn("created_at", "integer", (col) => col.notNull())
      .execute();

    await trx.schema
      .createIndex("release_revisions_release_id_created_at_idx")
      .on("release_revisions")
      .columns(["release_id", "created_at"])
      .execute();
  });
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("release_revisions").execute();
}
