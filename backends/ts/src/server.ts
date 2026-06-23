import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import Fastify from "fastify";
import cors from "@fastify/cors";
import type { Project } from "@aicut/core";
import { renderProject } from "./render.js";

const app = Fastify({
  logger: true,
  bodyLimit: 10 * 1024 * 1024,
});

await app.register(cors, { origin: true });

app.get("/health", async () => ({ ok: true }));

interface ExportBody {
  project: Project;
  output?: { width?: number; height?: number; fps?: number };
}

app.post("/export", async (req, reply) => {
  const body = req.body as ExportBody | undefined;
  if (!body?.project) {
    return reply.code(400).send({ error: "Missing project in request body" });
  }
  const controller = new AbortController();
  req.raw.once("close", () => controller.abort());

  try {
    const { outputPath, cleanup } = await renderProject(body.project, {
      ...body.output,
      signal: controller.signal,
    });
    const stats = await stat(outputPath);
    reply
      .header("content-type", "video/mp4")
      .header("content-length", stats.size)
      .header("content-disposition", 'attachment; filename="aicut.mp4"');
    const stream = createReadStream(outputPath);
    stream.once("close", () => {
      void cleanup();
    });
    return reply.send(stream);
  } catch (err) {
    req.log.error({ err }, "export failed");
    return reply.code(500).send({ error: (err as Error).message });
  }
});

const port = Number(process.env["PORT"] ?? 8787);
const host = process.env["HOST"] ?? "127.0.0.1";

app.listen({ port, host }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
