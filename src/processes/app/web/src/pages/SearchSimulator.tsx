import { ChevronLeft, ChevronRight, Search as SearchIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { api, type SearchResultItem, type SearchResult } from "../api/client";
import { Button } from "../components/Button";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { EmptyState } from "../components/EmptyState";
import { StatusPill, type StatusTone } from "../components/StatusPill";
import "./SearchSimulator.css";

const PAGE_SIZE = 50;

const AVAILABILITY_TONE: Record<SearchResultItem["availability"], StatusTone> = {
  available: "success",
  unknown: "neutral",
  unavailable: "destructive",
};

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

export function SearchSimulator() {
  const [title, setTitle] = useState("");
  const [season, setSeason] = useState("");
  const [episode, setEpisode] = useState("");
  const [offset, setOffset] = useState(0);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);

  async function runSearch(nextOffset: number): Promise<void> {
    setSearching(true);
    try {
      const response = await api.search({
        q: title.trim() || undefined,
        season: season ? Number(season) : undefined,
        episode: episode ? Number(episode) : undefined,
        offset: nextOffset,
        limit: PAGE_SIZE,
      });
      setOffset(nextOffset);
      setResult(response);
    } finally {
      setSearching(false);
    }
  }

  function handleSubmit(e: FormEvent): void {
    e.preventDefault();
    void runSearch(0);
  }

  const columns: DataTableColumn<SearchResultItem>[] = [
    {
      key: "title",
      header: "Release",
      sortValue: (row) => row.release.displayTitle,
      render: (row) => <span className="mono">{row.release.displayTitle}</span>,
    },
    {
      key: "episode",
      header: "Season / Episode",
      render: (row) => (row.release.season !== null && row.release.episode !== null ? `S${row.release.season}E${row.release.episode}` : "—"),
    },
    {
      key: "size",
      header: "Size",
      sortValue: (row) => row.sizeBytes ?? 0,
      render: (row) => <span className="mono text-sm">{formatBytes(row.sizeBytes)}</span>,
    },
    {
      key: "availability",
      header: "Availability",
      render: (row) => <StatusPill tone={AVAILABILITY_TONE[row.availability]}>{row.availability}</StatusPill>,
    },
  ];

  const hasSearched = result !== null;
  const isBrowseMode = title.trim().length === 0;
  const zeroBecauseNoSeriesMatch = hasSearched && !isBrowseMode && result.matchedSeriesIds.length === 0;
  const zeroBecauseEmptyCatalog = hasSearched && isBrowseMode && result.items.length === 0;

  return (
    <div>
      <h2>Search simulator</h2>
      <p className="muted text-sm search-simulator-intro">
        Runs the same query Sonarr would send over Torznab, against the same approved-and-available releases.
      </p>

      <form className="search-simulator-form" onSubmit={handleSubmit}>
        <input placeholder="Series title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input placeholder="Season" type="number" min={0} value={season} onChange={(e) => setSeason(e.target.value)} />
        <input placeholder="Episode" type="number" min={0} value={episode} onChange={(e) => setEpisode(e.target.value)} />
        <Button type="submit" variant="primary" loading={searching}>
          <SearchIcon size={14} aria-hidden="true" />
          Search
        </Button>
      </form>

      {hasSearched && (
        <>
          {zeroBecauseNoSeriesMatch ? (
            <EmptyState
              icon={<SearchIcon size={28} />}
              title="No local series matched this title"
              description="The query didn't match any known series or alias closely enough — add an alias, or check spelling."
            />
          ) : (
            <DataTable
              columns={columns}
              rows={result.items}
              rowKey={(row) => row.release.id}
              emptyState={
                zeroBecauseEmptyCatalog ? (
                  <EmptyState
                    icon={<SearchIcon size={28} />}
                    title="No approved releases yet"
                    description="Nothing in the catalog is approved and available yet — check back once releases clear review."
                  />
                ) : (
                  <EmptyState
                    icon={<SearchIcon size={28} />}
                    title="Series matched, but nothing to show"
                    description="A local series matched this query, but it has no approved and available releases yet."
                  />
                )
              }
            />
          )}

          {result.total > PAGE_SIZE && (
            <div className="search-simulator-paging">
              <Button variant="ghost" disabled={offset === 0 || searching} onClick={() => void runSearch(Math.max(0, offset - PAGE_SIZE))}>
                <ChevronLeft size={14} aria-hidden="true" />
                Prev
              </Button>
              <span className="muted text-sm">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, result.total)} of {result.total}
              </span>
              <Button variant="ghost" disabled={offset + PAGE_SIZE >= result.total || searching} onClick={() => void runSearch(offset + PAGE_SIZE)}>
                Next
                <ChevronRight size={14} aria-hidden="true" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
