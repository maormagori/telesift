import { Check, Search, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type EditReleaseInput, type Release, type Series } from "../api/client";
import { Button } from "../components/Button";
import "./ReleaseEditForm.css";

function toFormValue(value: string | number | null): string {
  return value === null ? "" : String(value);
}

export function ReleaseEditForm({
  release,
  currentSeriesTitle,
  onSaved,
  onCancel,
}: {
  release: Release;
  currentSeriesTitle: string | null;
  onSaved: (updated: Release) => void;
  onCancel: () => void;
}) {
  const [season, setSeason] = useState(toFormValue(release.season));
  const [episode, setEpisode] = useState(toFormValue(release.episode));
  const [resolution, setResolution] = useState(toFormValue(release.resolution));
  const [source, setSource] = useState(toFormValue(release.source));
  const [codec, setCodec] = useState(toFormValue(release.codec));
  const [language, setLanguage] = useState(toFormValue(release.language));
  const [seriesId, setSeriesId] = useState(release.seriesId);
  const [seriesQuery, setSeriesQuery] = useState("");
  const [seriesResults, setSeriesResults] = useState<Series[]>([]);
  const [selectedSeriesTitle, setSelectedSeriesTitle] = useState<string | null>(currentSeriesTitle);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (seriesQuery.trim().length < 2) {
      setSeriesResults([]);
      return;
    }
    const handle = setTimeout(() => {
      void api.searchSeries(seriesQuery.trim()).then(setSeriesResults);
    }, 300);
    return () => clearTimeout(handle);
  }, [seriesQuery]);

  function selectSeries(series: Series): void {
    setSeriesId(series.id);
    setSelectedSeriesTitle(series.canonicalTitle);
    setSeriesQuery("");
    setSeriesResults([]);
  }

  async function handleSubmit(): Promise<void> {
    setSaving(true);
    try {
      const input: EditReleaseInput = {
        seriesId,
        season: season.trim() === "" ? null : Number(season),
        episode: episode.trim() === "" ? null : Number(episode),
        resolution: resolution.trim() === "" ? null : resolution.trim(),
        source: source.trim() === "" ? null : source.trim(),
        codec: codec.trim() === "" ? null : codec.trim(),
        language: language.trim() === "" ? null : language.trim(),
      };
      onSaved(await api.editRelease(release.id, input));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="release-edit-form">
      <div className="release-edit-field release-edit-field-series">
        <span>Series</span>
        {seriesId === release.seriesId && selectedSeriesTitle === null ? (
          <input
            placeholder="Search to reassign..."
            value={seriesQuery}
            onChange={(e) => setSeriesQuery(e.target.value)}
          />
        ) : (
          <div className="release-edit-series-selected">
            {selectedSeriesTitle}
            <button
              type="button"
              onClick={() => {
                setSeriesId(release.seriesId);
                setSelectedSeriesTitle(null);
              }}
              aria-label="Clear series selection"
            >
              <X size={12} />
            </button>
          </div>
        )}
        {seriesResults.length > 0 && (
          <ul className="release-edit-series-results">
            {seriesResults.map((series) => (
              <li key={series.id}>
                <button type="button" onClick={() => selectSeries(series)}>
                  <Search size={12} aria-hidden="true" />
                  {series.canonicalTitle}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="release-edit-grid">
        <label className="release-edit-field">
          <span>Season</span>
          <input inputMode="numeric" value={season} onChange={(e) => setSeason(e.target.value)} />
        </label>
        <label className="release-edit-field">
          <span>Episode</span>
          <input inputMode="numeric" value={episode} onChange={(e) => setEpisode(e.target.value)} />
        </label>
        <label className="release-edit-field">
          <span>Resolution</span>
          <input value={resolution} onChange={(e) => setResolution(e.target.value)} />
        </label>
        <label className="release-edit-field">
          <span>Source</span>
          <input value={source} onChange={(e) => setSource(e.target.value)} />
        </label>
        <label className="release-edit-field">
          <span>Codec</span>
          <input value={codec} onChange={(e) => setCodec(e.target.value)} />
        </label>
        <label className="release-edit-field">
          <span>Language</span>
          <input value={language} onChange={(e) => setLanguage(e.target.value)} />
        </label>
      </div>

      <div className="release-edit-actions">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" loading={saving} onClick={() => void handleSubmit()}>
          <Check size={14} aria-hidden="true" />
          Save changes
        </Button>
      </div>
    </div>
  );
}
