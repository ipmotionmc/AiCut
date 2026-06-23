import type { Ms } from "../types.js";

/** mm:ss (rounded to seconds) — matches the toolbar reference. */
export function fmtClock(ms: Ms): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${pad2(m)}:${pad2(s)}`;
}

/** mm:ss.mmm with millisecond precision — used in the time label. */
export function fmtClockMs(ms: Ms): string {
  const total = Math.max(0, Math.round(ms));
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const r = total % 1000;
  return `${pad2(m)}:${pad2(s)}.${pad3(r)}`;
}

const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const pad3 = (n: number) => n.toString().padStart(3, "0");
