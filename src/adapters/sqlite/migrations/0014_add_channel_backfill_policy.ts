import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("channels")
    .addColumn("backfill_enabled", "integer", (col) => col.notNull().defaultTo(1))
    .execute();
  await db.schema.alterTable("channels").addColumn("backfill_max_messages", "integer").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("channels").dropColumn("backfill_max_messages").execute();
  await db.schema.alterTable("channels").dropColumn("backfill_enabled").execute();
}
