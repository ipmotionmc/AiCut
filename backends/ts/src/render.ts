import { mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import type { Project } from "@aicut/core";
import { resolveFfmpeg, runFfmpeg } from "./ffmpeg.js";

export interface RenderOptions {
  /** Output width — defaults to source width. */
  width?: number;
  /** Output height — defaults to source height. */
  height?: number;
  /** Output fps — defaults to source fps. */
  fps?: number;
  signal?: AbortSignal;
}

export interface RenderResult {
  outputPath: string;
  cleanup: () => Promise<void>;
}

/**
 * Render a Project's video track to a single mp4 file.
 *
 * Approach (simplest correct path for v1):
 *   1. For each clip, run ffmpeg with `-ss in -i url -t duration` and
 *      re-encode to a normalized H.264/AAC mp4 segment. Re-encoding (vs
 *      stream copy) sidesteps codec-mismatch / GOP-alignment issues
 *      between clips from different sources.
 *   2. Build a concat-demuxer list file pointing at the segments.
 *   3. Final pass: `ffmpeg -f concat -safe 0 -i list.txt -c copy out.mp4`.
 *
 * Caller is responsible for calling `cleanup()` after streaming the
 * output back to the client.
 */
export async function renderProject(
  project: Project,
  opts: RenderOptions = {},
): Promise<RenderResult> {
  const bin = await resolveFfmpeg();
  const work = await mkdtemp(path.join(tmpdir(), "aicut-"));
  const cleanup = async () => {
    try {
      await rm(work, { recursive: true, force: true });
    } catch {
      // best effort
    }
  };

  try {
    const videoTrack = project.tracks.find((t) => t.kind === "video");
    if (!videoTrack || videoTrack.clips.length === 0) {
      throw new Error("Project has no video clips to export");
    }
    const sources = new Map(project.sources.map((s) => [s.id, s]));

    const segmentPaths: string[] = [];
    let i = 0;
    for (const clip of videoTrack.clips) {
      const src = sources.get(clip.sourceId);
      if (!src) throw new Error(`Missing source ${clip.sourceId}`);
      const seg = path.join(work, `seg-${i++}.mp4`);
      const inSec = clip.in / 1000;
      const durSec = (clip.out - clip.in) / 1000;
      const args = [
        "-y",
        "-ss",
        inSec.toString(),
        "-i",
        src.url,
        "-t",
        durSec.toString(),
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
      ];
      if (opts.width && opts.height) {
        args.push(
          "-vf",
          `scale=${opts.width}:${opts.height}:force_original_aspect_ratio=decrease,pad=${opts.width}:${opts.height}:(ow-iw)/2:(oh-ih)/2`,
        );
      }
      if (opts.fps) {
        args.push("-r", opts.fps.toString());
      }
      args.push(seg);
      const { code, stderr } = await runFfmpeg(bin, args, opts.signal);
      if (code !== 0) {
        throw new Error(`ffmpeg segment ${i} failed: ${stderr.slice(-2000)}`);
      }
      segmentPaths.push(seg);
    }

    const listPath = path.join(work, "concat.txt");
    const listContent = segmentPaths
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'`)
      .join("\n");
    await writeFile(listPath, listContent, "utf8");

    const outputPath = path.join(work, "output.mp4");
    const concatArgs = [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      outputPath,
    ];
    const concat = await runFfmpeg(bin, concatArgs, opts.signal);
    if (concat.code !== 0) {
      throw new Error(`ffmpeg concat failed: ${concat.stderr.slice(-2000)}`);
    }
    return { outputPath, cleanup };
  } catch (err) {
    await cleanup();
    throw err;
  }
}
