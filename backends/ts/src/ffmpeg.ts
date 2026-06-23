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

export interface FfmpegRunOpts {
  signal?: AbortSignal;
  /**
   * Called for each newline-terminated chunk on ffmpeg's STDOUT.
   * We use this to consume ffmpeg's `-progress pipe:1` output — a
   * stream of `key=value` lines terminated by `progress=continue` or
   * `progress=end` after each report block.
   */
  onStdoutLine?: (line: string) => void;
}

export function runFfmpeg(
  bin: string,
  args: string[],
  opts: FfmpegRunOpts = {},
): Promise<FfmpegRunResult> {
  return new Promise((resolve, reject) => {
    // We want stdout when progress is being parsed; without an
    // onStdoutLine consumer, draining it costs nothing meaningful but
    // keeps the contract uniform.
    const proc = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    let stdoutBuf = "";
    proc.stdout.on("data", (b: Buffer) => {
      if (!opts.onStdoutLine) return;
      stdoutBuf += b.toString();
      let nl: number;
      while ((nl = stdoutBuf.indexOf("\n")) >= 0) {
        const line = stdoutBuf.slice(0, nl).trimEnd();
        stdoutBuf = stdoutBuf.slice(nl + 1);
        if (line) opts.onStdoutLine(line);
      }
    });
    proc.stderr.on("data", (b: Buffer) => {
      stderr += b.toString();
    });
    proc.once("error", (err) => reject(err));
    proc.once("close", (code) => resolve({ code: code ?? -1, stderr }));
    opts.signal?.addEventListener(
      "abort",
      () => {
        proc.kill("SIGTERM");
      },
      { once: true },
    );
  });
}
