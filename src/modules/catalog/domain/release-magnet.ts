import { createHash } from "node:crypto";

/**
 * There is no real BitTorrent swarm behind a Telegram release — this mints a
 * stable, 40-hex-character BTIH-shaped identifier from the release id alone,
 * so it can be embedded in a magnet URI before any download row exists. Sonarr
 * computes its own copy of this hash straight from the magnet it grabbed, so
 * the value must be a pure function of the release id, never minted server-side
 * after the fact.
 */
export function releaseIdToBtih(releaseId: number): string {
  return createHash("sha1").update(`telesift-release-${releaseId}`).digest("hex");
}

/**
 * `dn` carries the release id in cleartext so `extractReleaseIdFromMagnetUri`
 * can recover it later — the btih itself is one-way.
 */
export function releaseIdToMagnetUri(releaseId: number): string {
  return `magnet:?xt=urn:btih:${releaseIdToBtih(releaseId)}&dn=${releaseId}`;
}

export function extractReleaseIdFromMagnetUri(uri: string): number | null {
  const queryIndex = uri.indexOf("?");
  if (queryIndex === -1) return null;

  const dn = new URLSearchParams(uri.slice(queryIndex + 1)).get("dn");
  if (!dn) return null;

  const releaseId = Number(dn);
  return Number.isInteger(releaseId) && releaseId > 0 ? releaseId : null;
}
