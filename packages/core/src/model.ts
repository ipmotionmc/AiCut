import { createId } from "./ids.js";
import type { Clip, Ms, Project, Track } from "./types.js";

export function createEmptyProject(): Project {
  return {
    version: 1,
    sources: [],
    tracks: [{ id: createId("track"), kind: "video", clips: [] }],
  };
}

export function clipDuration(c: Clip): Ms {
  return c.out - c.in;
}

/** End of a clip on the timeline (start + duration). */
export function clipEnd(c: Clip): Ms {
  return c.start + clipDuration(c);
}

export function trackEnd(track: Track): Ms {
  let max = 0;
  for (const c of track.clips) {
    const end = clipEnd(c);
    if (end > max) max = end;
  }
  return max;
}

/**
 * Find which clip on the track contains `timeMs`. Edges:
 *   - start inclusive
 *   - end exclusive (a clip ending at T does not contain T)
 */
export function findClipContaining(track: Track, timeMs: Ms): Clip | null {
  for (const c of track.clips) {
    if (timeMs >= c.start && timeMs < clipEnd(c)) return c;
  }
  return null;
}

export function findTrackOfClip(
  project: Project,
  clipId: string,
): Track | null {
  for (const t of project.tracks) {
    if (t.clips.some((c) => c.id === clipId)) return t;
  }
  return null;
}

/**
 * Defensive normalization — ensures clips on each track are sorted by
 * `start`, IDs exist, and trivially-empty clips (out <= in) are dropped.
 * Called from `Editor.setProject` so consumers can hand us loosely-formed
 * JSON without risking inconsistent internal state.
 */
export function normalizeProject(project: Project): Project {
  const sources = project.sources.map((s) => ({ ...s }));
  const tracks = project.tracks.map<Track>((t) => {
    const clips = t.clips
      .filter((c) => c.out > c.in)
      .map<Clip>((c) => ({ ...c, id: c.id || createId("clip") }))
      .sort((a, b) => a.start - b.start);
    return { ...t, id: t.id || createId("track"), clips };
  });
  return { version: 1, sources, tracks };
}

/** Splits a clip at `localOffset` ms (measured from clip.start on the timeline). */
export function splitClipAt(clip: Clip, localOffset: Ms): [Clip, Clip] | null {
  const sourceLen = clip.out - clip.in;
  if (localOffset <= 0 || localOffset >= sourceLen) return null;
  const left: Clip = { ...clip, out: clip.in + localOffset };
  const right: Clip = {
    ...clip,
    id: createId("clip"),
    in: clip.in + localOffset,
    start: clip.start + localOffset,
  };
  return [left, right];
}

/** Alias retained for back-compat with existing call sites. */
export function findClipAt(track: Track, timeMs: Ms): Clip | null {
  return findClipContaining(track, timeMs);
}

export function projectDuration(project: Project): Ms {
  let max = 0;
  for (const t of project.tracks) {
    const e = trackEnd(t);
    if (e > max) max = e;
  }
  return max;
}
