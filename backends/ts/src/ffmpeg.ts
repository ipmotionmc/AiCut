import { spawn } from "node:child_process";
import { access, constants } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Resolve which ffmpeg binary to use. Order of preference:
 *   1. AICUT_FFMPEG env var (explicit override)
 *   2. ./ffmpeg-bin/ffmpeg next to the running backend (extracted from
 *      the layered ffmpeg.zip — see backends/ts/README.md)
 *   3. system PATH `ffmpeg`
 */
export async function resolveFfmpeg(): Promise<string> {
  const envBin = process.env["AICUT_FFMPEG"];
  if (envBin && (await fileExists(envBin))) return envBin;

  const bundled = path.resolve(__dirname, "..", "ffmpeg-bin", "ffmpeg");
  if (await fileExists(bundled)) return bundled;

  return "ffmpeg";
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export interface FfmpegRunResult {
  code: number;
  stderr: string;
}

export function runFfmpeg(
  bin: string,
  args: string[],
  signal?: AbortSignal,
): Promise<FfmpegRunResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (b: Buffer) => {
      stderr += b.toString();
    });
    proc.once("error", (err) => reject(err));
    proc.once("close", (code) => resolve({ code: code ?? -1, stderr }));
    signal?.addEventListener(
      "abort",
      () => {
        proc.kill("SIGTERM");
      },
      { once: true },
    );
  });
}
