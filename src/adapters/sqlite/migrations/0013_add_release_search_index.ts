import { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createIndex("releases_review_state_series_id_season_episode_idx")
    .on("releases")
    .columns(["review_state", "series_id", "season", "episode"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("releases_review_state_series_id_season_episode_idx").execute();
}
