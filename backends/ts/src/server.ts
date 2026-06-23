import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import Fastify from "fastify";
import cors from "@fastify/cors";
import type { Project } from "@aicut/core";
import { renderProject, type ProgressEvent } from "./render.js";

const app = Fastify({
  logger: true,
  bodyLimit: 10 * 1024 * 1024,
});

await app.register(cors, { origin: true });

const OUTPUTS_DIR = path.resolve(process.cwd(), "outputs");
await mkdir(OUTPUTS_DIR, { recursive: true });

app.get("/health", async () => ({ ok: true, backend: "ts" }));

interface ExportBody {
  project: Project;
  output?: { width?: number; height?: number; fps?: number };
}

/**
 * Streams the export job back as Server-Sent Events. Each `data:` line
 * is a JSON object with `phase` ∈ {encode, concat, done, error} plus
 * progress / final-url fields. Client uses a fetch + ReadableStream
 * reader (EventSource doesn't accept POST bodies).
 */
app.post("/export", async (req, reply) => {
  const body = req.body as ExportBody | undefined;
  if (!body?.project) {
    return reply.code(400).send({ error: "Missing project in request body" });
  }

  const id = randomUUID();
  const outputPath = path.join(OUTPUTS_DIR, `${id}.mp4`);

  reply.raw.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    // CORS preflight already accepted by the cors plugin above; SSE
    // responses need the origin header repeated on the raw write.
    "access-control-allow-origin": req.headers.origin ?? "*",
  });

  const send = (data: object): void => {
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const controller = new AbortController();
  req.raw.once("close", () => controller.abort());

  // Heartbeat — keep proxies / load balancers from closing the
  // connection during long encodes that emit no progress events.
  const heartbeat = setInterval(() => {
    reply.raw.write(": ping\n\n");
  }, 15_000);

  try {
    let lastSent = 0;
    await renderProject(body.project, {
      ...body.output,
      outputPath,
      signal: controller.signal,
      onProgress: (e: ProgressEvent) => {
        // Throttle to ~5/sec so the SSE stream isn't a flood when the
        // ffmpeg fast preset emits dozens of progress lines per sec.
        const now = Date.now();
        if (e.phase === "encode" && now - lastSent < 200) return;
        lastSent = now;
        send(e);
      },
    });
    send({ phase: "done", fileUrl: `/files/${id}.mp4`, id });
  } catch (err) {
    req.log.error({ err }, "export failed");
    send({ phase: "error", error: (err as Error).message });
  } finally {
    clearInterval(heartbeat);
    reply.raw.end();
  }
});

/**
 * Serve rendered mp4 files. ID is constrained to a uuid+`.mp4` shape
 * — paranoid sanity check against path traversal even though the
 * dirname join below would already block `..`.
 */
app.get("/files/:id", async (req, reply) => {
  const { id } = req.params as { id: string };
  if (!/^[a-f0-9-]{36}\.mp4$/i.test(id)) {
    return reply.code(400).send({ error: "bad file id" });
  }
  const p = path.join(OUTPUTS_DIR, id);
  const stats = await stat(p).catch(() => null);
  if (!stats) return reply.code(404).send({ error: "not found" });
  reply
    .header("content-type", "video/mp4")
    .header("content-length", stats.size)
    .header("cache-control", "no-store");
  return reply.send(createReadStream(p));
});

const port = Number(process.env["PORT"] ?? 8787);
const host = process.env["HOST"] ?? "127.0.0.1";

app.listen({ port, host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
