# @aicut/core

Framework-agnostic video editor core.

```ts
import { Editor } from "@aicut/core";
import "@aicut/core/styles.css";

const editor = Editor.create({
  container: document.getElementById("app")!,
  project: {
    version: 1,
    sources: [
      { id: "s1", url: "https://example.com/a.mov", kind: "video" },
    ],
    tracks: [
      {
        id: "t1",
        kind: "video",
        clips: [{ id: "c1", sourceId: "s1", in: 0, out: 5000, start: 0 }],
      },
    ],
  },
});

editor.on("change", ({ project }) => {
  localStorage.setItem("aicut-project", JSON.stringify(project));
});

editor.on("export", ({ project }) => {
  fetch("/api/export", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(project),
  });
});
```

See `Editor` for the full API. For React or Vue, prefer `@aicut/react` /
`@aicut/vue`, which wrap this same instance.
