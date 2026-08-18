import { releaseIdToMagnetUri } from "../../modules/catalog/domain/release-magnet.js";
import type { ReleaseSearchResult } from "../../modules/catalog/ports/release-search-repository.js";

const TV_CATEGORY = 5000;

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildCapsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<caps>
  <server version="1.0" title="TeleSift" />
  <limits max="100" default="50" />
  <registration available="no" />
  <searching>
    <search available="yes" supportedParams="q" />
    <tv-search available="yes" supportedParams="q,season,ep" />
    <movie-search available="no" supportedParams="" />
  </searching>
  <categories>
    <category id="${TV_CATEGORY}" name="TV">
      <subcat id="5030" name="SD" />
      <subcat id="5040" name="HD" />
    </category>
  </categories>
</caps>`;
}

export function buildErrorXml(code: number, description: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<error code="${code}" description="${escapeXml(description)}" />`;
}

export function buildSearchResultsXml(items: ReleaseSearchResult[], offset: number, total: number): string {
  const itemsXml = items
    .map(({ release, sizeBytes }) => {
      const magnetUri = escapeXml(releaseIdToMagnetUri(release.id));
      const size = sizeBytes ?? 0;
      const title = escapeXml(release.displayTitle);
      return `    <item>
      <title>${title}</title>
      <guid isPermaLink="false">telesift:release:${release.id}</guid>
      <link>${magnetUri}</link>
      <pubDate>${new Date(release.createdAt).toUTCString()}</pubDate>
      <category>${TV_CATEGORY}</category>
      <enclosure url="${magnetUri}" length="${size}" type="application/x-bittorrent" />
      <newznab:attr name="category" value="${TV_CATEGORY}" />
      <newznab:attr name="size" value="${size}" />
      <!-- There is no real swarm behind a Telegram release (see release-magnet.ts) — Sonarr's
           Torznab client expects these attrs to be present and treats a nonzero seeder count
           as "grabbable", so a real value of 0 would make it skip the result. -->
      <newznab:attr name="seeders" value="1" />
      <newznab:attr name="peers" value="0" />
    </item>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:newznab="http://www.newznab.com/DTD/2010/feeds/attributes/1.0">
  <channel>
    <title>TeleSift</title>
    <newznab:response offset="${offset}" total="${total}" />
${itemsXml}
  </channel>
</rss>`;
}
