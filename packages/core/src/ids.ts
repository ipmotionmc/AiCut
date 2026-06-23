/**
 * Short, stable, URL-safe ID. Not cryptographic — fine for client IDs
 * that get persisted in the project JSON.
 */
export function createId(prefix = "id"): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const t = Date.now().toString(36).slice(-4);
  return `${prefix}_${t}${rand}`;
}
