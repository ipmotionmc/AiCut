# @aicut/react

React wrapper around `@aicut/core`. Import the core stylesheet once in your app and drop the component anywhere.

```tsx
import { VideoEditor, type VideoEditorApi } from "@aicut/react";
import "@aicut/core/styles.css";
import { useRef } from "react";

export function MyEditor({ project, onSave }) {
  const apiRef = useRef<VideoEditorApi | null>(null);
  return (
    <VideoEditor
      defaultProject={project}
      apiRef={apiRef}
      onChange={onSave}
      onExport={async (project) => {
        await fetch("/api/export", { method: "POST", body: JSON.stringify(project) });
      }}
      style={{ height: 600 }}
    />
  );
}
```

The component is uncontrolled for project state (the editor owns it). To restore from JSON, call `apiRef.current.setProject(saved)`.
