export interface DisplayTitleInput {
  seriesTitle: string;
  season: number | null;
  episode: number | null;
  resolution: string | null;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function buildDisplayTitle(input: DisplayTitleInput): string {
  const parts = [input.seriesTitle.trim().replace(/\s+/g, ".")];
  if (input.season !== null && input.episode !== null) {
    parts.push(`S${pad2(input.season)}E${pad2(input.episode)}`);
  }
  if (input.resolution) parts.push(input.resolution);
  parts.push("Telegram");
  return parts.join(".");
}
