import { describe, expect, it } from "vitest";
import { localeEn, localeZh } from "../i18n.js";
import type { MediaSource } from "../types.js";
import { clipDisplayLabel } from "./draw.js";

const src = (over: Partial<MediaSource>): MediaSource => ({
  id: "src_1",
  url: "/a.mov",
  kind: "video",
  ...over,
});

describe("clipDisplayLabel", () => {
  it("prefers the explicit source name", () => {
    expect(
      clipDisplayLabel(src({ name: "拍摄素材.mp4", url: "/x%20y.mp4" }), localeEn),
    ).toBe("拍摄素材.mp4");
  });

  it("percent-decodes the URL filename", () => {
    expect(
      clipDisplayLabel(
        src({ url: "https://cdn.example.com/media/%E8%A7%86%E9%A2%91%201.mp4" }),
        localeEn,
      ),
    ).toBe("视频 1.mp4");
  });

  it("strips query strings and hashes (signed URLs)", () => {
    expect(
      clipDisplayLabel(
        src({ url: "https://oss.example.com/a/b/clip.mp4?Expires=1&Signature=xyz#t=3" }),
        localeEn,
      ),
    ).toBe("clip.mp4");
  });

  it("keeps malformed escapes as-is instead of throwing", () => {
    expect(
      clipDisplayLabel(src({ url: "/videos/bad%2-name.mp4" }), localeEn),
    ).toBe("bad%2-name.mp4");
  });

  it("falls back to the locale label for blob: and data: URLs", () => {
    expect(
      clipDisplayLabel(
        src({ url: "blob:http://localhost:5173/2f6c3f2e-9d1e-4e5f" }),
        localeZh,
      ),
    ).toBe(localeZh.unnamedClip);
    expect(
      clipDisplayLabel(src({ url: "data:video/mp4;base64,AAAA" }), localeEn),
    ).toBe(localeEn.unnamedClip);
  });

  it("falls back to the locale label when the source is missing", () => {
    expect(clipDisplayLabel(undefined, localeEn)).toBe(localeEn.unnamedClip);
  });
});
