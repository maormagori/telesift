import { createHash } from "node:crypto";
import type { ContextGroupMember } from "./context-group.js";

/**
 * Keyed by member content fingerprint (not just message identity) so an edit to any member
 * message recomputes the fingerprint and schedules another extraction, per AGENTS.md's
 * "When relevant messages change, recompute the context input fingerprint" rule.
 */
export function computeContextInputFingerprint(
  members: ContextGroupMember[],
  messageFingerprints: ReadonlyMap<number, string>,
): string {
  const stable = members
    .slice()
    .sort((a, b) => a.messageId - b.messageId)
    .map((member) => ({
      messageId: member.messageId,
      role: member.role,
      fingerprint: messageFingerprints.get(member.messageId) ?? null,
    }));
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}
