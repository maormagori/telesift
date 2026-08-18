import { describe, expect, it } from "vitest";
import type { Release } from "../../modules/catalog/domain/release.js";
import { releaseIdToMagnetUri } from "../../modules/catalog/domain/release-magnet.js";
import type { ReleaseSearchResult } from "../../modules/catalog/ports/release-search-repository.js";
import { buildCapsXml, buildErrorXml, buildSearchResultsXml, escapeXml } from "./xml.js";

function fakeRelease(overrides: Partial<Release> = {}): Release {
  return {
    id: 1,
    mediaAssetId: 1,
    seriesId: 1,
    extractionRunId: 1,
    season: 4,
    episode: 3,
    resolution: "1080p",
    source: null,
    codec: null,
    language: "he",
    displayTitle: "Fauda.S04E03.1080p.Telegram",
    reviewState: "approved",
    manuallyVerified: false,
    manuallyVerifiedAt: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("escapeXml", () => {
  it("escapes reserved XML characters", () => {
    expect(escapeXml(`A & B <C> "D" 'E'`)).toBe("A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos;");
  });
});

describe("buildCapsXml", () => {
  it("advertises tv-search with q, season, ep", () => {
    const xml = buildCapsXml();
    expect(xml).toContain('<tv-search available="yes" supportedParams="q,season,ep" />');
    expect(xml).toContain('<category id="5000" name="TV">');
    expect(xml).toContain('<subcat id="5030" name="SD" />');
    expect(xml).toContain('<subcat id="5040" name="HD" />');
  });

  it("declares no registration is required", () => {
    const xml = buildCapsXml();
    expect(xml).toContain('<registration available="no" />');
  });
});

describe("buildErrorXml", () => {
  it("renders a newznab-style error with code and escaped description", () => {
    const xml = buildErrorXml(100, `bad "key"`);
    expect(xml).toContain('<error code="100" description="bad &quot;key&quot;" />');
  });
});

describe("buildSearchResultsXml", () => {
  it("renders one item per result with title, guid, magnet link, size, and paging attrs", () => {
    const release = fakeRelease();
    const item: ReleaseSearchResult = { release, sizeBytes: 123456, availability: "available" };

    const xml = buildSearchResultsXml([item], 0, 1);

    expect(xml).toContain(`<title>${release.displayTitle}</title>`);
    expect(xml).toContain(`<guid isPermaLink="false">telesift:release:${release.id}</guid>`);
    expect(xml).toContain(`<link>${escapeXml(releaseIdToMagnetUri(release.id))}</link>`);
    expect(xml).toContain('<newznab:attr name="size" value="123456" />');
    expect(xml).toContain('<newznab:response offset="0" total="1" />');
  });

  it("falls back to size 0 when sizeBytes is null", () => {
    const item: ReleaseSearchResult = { release: fakeRelease(), sizeBytes: null, availability: "unknown" };
    const xml = buildSearchResultsXml([item], 0, 1);
    expect(xml).toContain('<newznab:attr name="size" value="0" />');
  });

  it("XML-escapes a title containing reserved characters", () => {
    const item: ReleaseSearchResult = { release: fakeRelease({ displayTitle: "A & B" }), sizeBytes: null, availability: "available" };
    const xml = buildSearchResultsXml([item], 0, 1);
    expect(xml).toContain("<title>A &amp; B</title>");
  });

  it("renders an empty channel with correct offset/total for zero results", () => {
    const xml = buildSearchResultsXml([], 5, 0);
    expect(xml).toContain('<newznab:response offset="5" total="0" />');
    expect(xml).not.toContain("<item>");
  });
});
