import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Project } from "@iplex/aicut-core";
import { renderProject } from "./render.js";

/**
 * End-to-end keyframe rendering test — runs REAL ffmpeg twice:
 *
 *   1. Synthesize a deterministic source video with `lavfi/testsrc2`
 *      (no external file deps, no demo assets).
 *   2. Hand it to `renderProject` with a clip that has a scale-1→3→1
 *      keyframe ramp.
 *   3. Use ffprobe on the output to compare a known pixel between the
 *      first frame (scale=1, full image) and the middle frame (scale≈3,
 *      heavily cropped to a single zoomed quadrant). Different ⇒
 *      animation is actually running; same ⇒ the kf path was silently
 *      skipped (the exact regression that bit us when the demo wasn't
 *      sending output dims).
 *
 * Skipped when ffmpeg / ffprobe aren't on PATH so CI without media
 * tooling stays green. Locally `pnpm test` picks it up automatically.
 *
 * Cost: one synth + one re-encode + two ffprobes — ~3s on this laptop.
 */
const haveFfmpeg = await whichOk("ffmpeg");
const haveFfprobe = await whichOk("ffprobe");
const describeMaybe = haveFfmpeg && haveFfprobe ? describe : describe.skip;

describeMaybe("renderProject keyframe integration", () => {
  let workDir = "";
  let sourcePath = "";

  beforeAll(async () => {
    workDir = await mkdtemp(path.join(tmpdir(), "aicut-kf-it-"));
    sourcePath = path.join(workDir, "source.mp4");
    // testsrc2 paints a recognisable pattern (color bars + counter)
    // at the requested resolution / framerate / duration. We want a
    // long-enough source that mid-time is well into the kf ramp.
    await runProc("ffmpeg", [
      "-y",
      "-f", "lavfi",
      "-i", "testsrc2=size=640x360:rate=30:duration=4",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-pix_fmt", "yuv420p",
      sourcePath,
    ]);
  });

  afterAll(async () => {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  });

  it("animated scale actually shows up in the output frames", async () => {
    const outputPath = path.join(workDir, "out.mp4");
    const project: Project = {
      version: 1,
      sources: [
        { id: "s1", url: sourcePath, kind: "video", duration: 4000 },
      ],
      tracks: [
        {
          id: "t1",
          kind: "video",
          clips: [
            {
              id: "c1",
              sourceId: "s1",
              in: 0,
              out: 4000,
              start: 0,
              keyframes: [
                { id: "k1", prop: "scale", time: 0, value: 1 },
                { id: "k2", prop: "scale", time: 2000, value: 3 },
                { id: "k3", prop: "scale", time: 4000, value: 1 },
                { id: "k4", prop: "panX", time: 0, value: 0 },
                { id: "k5", prop: "panY", time: 0, value: 0 },
              ],
            },
          ],
        },
      ],
    };
    await renderProject(project, {
      width: 640,
      height: 360,
      fps: 30,
      outputPath,
    });
    const out = await stat(outputPath);
    expect(out.size).toBeGreaterThan(0);

    // Sample the center pixel at t=0 and t≈2s (peak scale). When scale
    // animates 1→3, the center of the bg quadrant moves from "color
    // bar" content to a heavily-zoomed-in portion — RGB values diverge
    // by far more than codec noise can account for. Threshold 30 per
    // channel is comfortably above libx264 ultrafast residual drift
    // (measured: ~5/255 on identical-content reruns).
    const pxFirst = await samplePixel(outputPath, 0, 320, 180);
    const pxMid = await samplePixel(outputPath, 2, 320, 180);
    const delta =
      Math.abs(pxFirst.r - pxMid.r) +
      Math.abs(pxFirst.g - pxMid.g) +
      Math.abs(pxFirst.b - pxMid.b);
    expect(delta).toBeGreaterThan(30);
  }, 30_000);

  it("no-kf clip renders cleanly through the static -vf path", async () => {
    // Mirror image — same source, no kfs. The center pixel at t=0 vs
    // t=2 should be CLOSE because testsrc2 is a static pattern, no
    // animation in the source. This catches a regression where the kf
    // branch leaked into the static path and applied some accidental
    // animation.
    const outputPath = path.join(workDir, "out-static.mp4");
    const project: Project = {
      version: 1,
      sources: [
        { id: "s1", url: sourcePath, kind: "video", duration: 4000 },
      ],
      tracks: [
        {
          id: "t1",
          kind: "video",
          clips: [
            { id: "c1", sourceId: "s1", in: 0, out: 4000, start: 0 },
          ],
        },
      ],
    };
    await renderProject(project, {
      width: 640,
      height: 360,
      fps: 30,
      outputPath,
    });
    const pxFirst = await samplePixel(outputPath, 0, 320, 180);
    const pxMid = await samplePixel(outputPath, 2, 320, 180);
    const delta =
      Math.abs(pxFirst.r - pxMid.r) +
      Math.abs(pxFirst.g - pxMid.g) +
      Math.abs(pxFirst.b - pxMid.b);
    // testsrc2 has a moving counter in one corner but the center
    // (320, 180) lands on a solid color zone that doesn't change.
    // Allow generous codec noise.
    expect(delta).toBeLessThan(15);
  }, 30_000);
});

// ---- helpers ----------------------------------------------------------

async function whichOk(bin: string): Promise<boolean> {
  try {
    await runProc(bin, ["-version"]);
    return true;
  } catch {
    return false;
  }
}

function runProc(bin: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (c) => (stderr += c.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${bin} exit ${code}: ${stderr.slice(-500)}`));
    });
  });
}

/** Sample the RGB of one pixel at a specific time in `file`. Extracts
 *  the full frame as raw rgb24 and indexes by (x, y) — small frames
 *  (640x360) keep this cheap and avoids ffmpeg crop-filter quirks
 *  with sub-pixel sizes. */
async function samplePixel(
  file: string,
  timeSec: number,
  x: number,
  y: number,
): Promise<{ r: number; g: number; b: number }> {
  const dir = path.dirname(file);
  const rawPath = path.join(dir, `frame-${timeSec}.raw`);
  await runProc("ffmpeg", [
    "-y",
    "-ss", timeSec.toString(),
    "-i", file,
    "-vframes", "1",
    "-f", "rawvideo",
    "-pix_fmt", "rgb24",
    rawPath,
  ]);
  const buf = await readFile(rawPath);
  const width = 640; // matches the test source / render target
  const idx = (y * width + x) * 3;
  return { r: buf[idx]!, g: buf[idx + 1]!, b: buf[idx + 2]! };
}
