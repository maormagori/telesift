import { useState } from "react";
import type { BackfillPolicy } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import "./AddChannelDialog.css";

function parseMaxMessages(raw: string): number | null | "invalid" {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : "invalid";
}

/** Collects a channel's backfill policy before it is added. Mount it fresh per add so its fields start at their defaults. */
export function AddChannelDialog({
  label,
  submitting,
  onConfirm,
  onCancel,
}: {
  label: string;
  submitting: boolean;
  onConfirm: (backfillPolicy: BackfillPolicy) => void;
  onCancel: () => void;
}) {
  const [backfillEnabled, setBackfillEnabled] = useState(true);
  const [maxMessagesRaw, setMaxMessagesRaw] = useState("");
  const maxMessages = parseMaxMessages(maxMessagesRaw);
  const invalid = backfillEnabled && maxMessages === "invalid";

  function confirm(): void {
    if (invalid) return;
    onConfirm({ enabled: backfillEnabled, maxMessages: backfillEnabled && maxMessages !== "invalid" ? maxMessages : null });
  }

  return (
    <ConfirmDialog
      open
      title={`Add ${label}`}
      description="Choose how much existing history to ingest. This can't be changed after the channel is added."
      confirmLabel="Add channel"
      confirmDisabled={invalid}
      confirmLoading={submitting}
      onConfirm={confirm}
      onCancel={onCancel}
    >
      <div className="add-channel-fields">
        <label className="add-channel-checkbox">
          <input type="checkbox" checked={backfillEnabled} onChange={(e) => setBackfillEnabled(e.target.checked)} />
          Backfill existing messages
        </label>
        <label className="add-channel-field">
          Messages to backfill
          <input
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            placeholder="All history"
            value={maxMessagesRaw}
            disabled={!backfillEnabled}
            aria-invalid={invalid}
            onChange={(e) => setMaxMessagesRaw(e.target.value)}
          />
          <span className={invalid ? "add-channel-hint add-channel-hint-error" : "add-channel-hint muted"}>
            {!backfillEnabled
              ? "Only messages posted from now on will be ingested."
              : invalid
                ? "Enter a whole number greater than 0, or leave blank."
                : "Counted back from the newest message. Blank means all history."}
          </span>
        </label>
      </div>
    </ConfirmDialog>
  );
}
