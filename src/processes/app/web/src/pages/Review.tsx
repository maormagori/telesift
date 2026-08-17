import { ChevronDown, ChevronRight, ListVideo, Pencil, Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type Release, type ReleaseDetail } from "../api/client";
import { Button } from "../components/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EmptyState } from "../components/EmptyState";
import { MediaPreview } from "../components/MediaPreview";
import { Skeleton } from "../components/Skeleton";
import { useToast } from "../components/Toast";
import { notifyAttentionChanged } from "../lib/refresh-bus";
import { ReleaseEditForm } from "./ReleaseEditForm";
import "./Review.css";

export function Review() {
  const { showToast } = useToast();
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, ReleaseDetail>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [pendingReject, setPendingReject] = useState<Release | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  async function refresh(): Promise<void> {
    setReleases(await api.listPendingReview({ limit: 100 }));
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function toggleExpand(release: Release): Promise<void> {
    if (expandedId === release.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(release.id);
    setEditingId(null);
    if (!details[release.id]) {
      const detail = await api.getReleaseDetail(release.id);
      setDetails((prev) => ({ ...prev, [release.id]: detail }));
    }
  }

  function removeFromQueue(releaseId: number): void {
    setReleases((prev) => (prev ? prev.filter((r) => r.id !== releaseId) : prev));
    if (expandedId === releaseId) setExpandedId(null);
  }

  async function withBusy(id: number, action: () => Promise<unknown>, failureMessage: string): Promise<void> {
    setBusyId(id);
    try {
      await action();
    } catch {
      showToast(failureMessage, "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleApprove(release: Release): Promise<void> {
    await withBusy(
      release.id,
      async () => {
        await api.approveRelease(release.id);
        showToast(`Approved ${release.displayTitle}`);
        removeFromQueue(release.id);
        notifyAttentionChanged();
      },
      `Could not approve ${release.displayTitle}`,
    );
  }

  async function confirmReject(): Promise<void> {
    if (!pendingReject) return;
    const release = pendingReject;
    setPendingReject(null);
    await withBusy(
      release.id,
      async () => {
        await api.rejectRelease(release.id);
        showToast(`Rejected ${release.displayTitle}`);
        removeFromQueue(release.id);
        notifyAttentionChanged();
      },
      `Could not reject ${release.displayTitle}`,
    );
  }

  function handleSaved(updated: Release): void {
    setReleases((prev) => (prev ? prev.map((r) => (r.id === updated.id ? updated : r)) : prev));
    setEditingId(null);
    void api.getReleaseDetail(updated.id).then((detail) => setDetails((prev) => ({ ...prev, [updated.id]: detail })));
    showToast(`Saved ${updated.displayTitle}`);
  }

  return (
    <div>
      <h2>Review queue</h2>
      {releases === null ? (
        <div className="skeleton-stack">
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
        </div>
      ) : releases.length === 0 ? (
        <EmptyState icon={<ListVideo size={28} />} title="Nothing waiting for review" description="Extracted candidates will show up here." />
      ) : (
        <ul className="review-list">
          {releases.map((release) => {
            const expanded = expandedId === release.id;
            const detail = details[release.id];
            return (
              <li key={release.id} className="review-item">
                <button type="button" className="review-item-header" onClick={() => void toggleExpand(release)}>
                  {expanded ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
                  <span className="review-item-title">{release.displayTitle}</span>
                  <span className="muted text-sm review-item-meta">
                    {release.resolution ?? "resolution unknown"}
                    {release.source ? ` · ${release.source}` : ""}
                  </span>
                </button>

                {expanded && (
                  <div className="review-item-body">
                    {!detail ? (
                      <Skeleton height="4rem" />
                    ) : (
                      <>
                        {detail.source.message?.text && <p className="review-item-source-text">{detail.source.message.text}</p>}
                        {detail.source.media && (
                          <MediaPreview
                            media={detail.source.media}
                            src={api.mediaUrl(detail.source.message?.chatId ?? "", detail.source.message?.telegramMessageId ?? 0)}
                          />
                        )}
                        {detail.revisions.length > 0 && (
                          <details className="review-item-revisions">
                            <summary>Change history ({detail.revisions.length})</summary>
                            <ul>
                              {detail.revisions.map((rev) => (
                                <li key={rev.id} className="muted text-sm">
                                  {new Date(rev.createdAt).toLocaleString()} · {rev.changeSource} by {rev.actor}
                                </li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </>
                    )}

                    {editingId === release.id ? (
                      <ReleaseEditForm
                        release={release}
                        currentSeriesTitle={detail?.seriesTitle ?? null}
                        onSaved={handleSaved}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <div className="review-item-actions">
                        <Button variant="ghost" onClick={() => setEditingId(release.id)}>
                          <Pencil size={14} aria-hidden="true" />
                          Edit
                        </Button>
                        <Button variant="danger" onClick={() => setPendingReject(release)} loading={busyId === release.id}>
                          <X size={14} aria-hidden="true" />
                          Reject
                        </Button>
                        <Button variant="primary" onClick={() => void handleApprove(release)} loading={busyId === release.id}>
                          <Check size={14} aria-hidden="true" />
                          Approve
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={pendingReject !== null}
        title={`Reject ${pendingReject?.displayTitle ?? "this release"}?`}
        description="This candidate won't be indexed. It stays rejected unless re-extracted."
        confirmLabel="Reject"
        tone="danger"
        onConfirm={() => void confirmReject()}
        onCancel={() => setPendingReject(null)}
      />
    </div>
  );
}
