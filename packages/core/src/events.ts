type Handler<T> = (payload: T) => void;

/**
 * Minimal typed event bus. Returns an unsubscribe function from `on` so
 * callers don't have to retain the handler reference. No once/wildcard
 * by design — keep the surface small until something needs them.
 *
 * EventMap is intentionally unconstrained — its keys are the event
 * names and values are payload types. An explicit `Record` constraint
 * would force consumers to add an index signature, which would in turn
 * mask typos in `emit` / `on`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export class EventBus<EventMap extends Record<string, any>> {
  private listeners = new Map<keyof EventMap, Set<Handler<any>>>();

  on<K extends keyof EventMap>(
    event: K,
    handler: Handler<EventMap[K]>,
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
    return () => this.off(event, handler);
  }

  off<K extends keyof EventMap>(event: K, handler: Handler<EventMap[K]>): void {
    this.listeners.get(event)?.delete(handler);
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const h of set) {
      try {
        h(payload);
      } catch (err) {
        // Swallow handler errors so one broken listener can't kill the editor.
        // eslint-disable-next-line no-console
        console.error("[aicut] event handler threw", event, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
