const target = new EventTarget();
const EVENT = "attention-changed";

/** Signals that review/download state changed, so the sidebar badges can refresh without waiting for the next poll. */
export function notifyAttentionChanged(): void {
  target.dispatchEvent(new Event(EVENT));
}

export function onAttentionChanged(listener: () => void): () => void {
  target.addEventListener(EVENT, listener);
  return () => target.removeEventListener(EVENT, listener);
}
