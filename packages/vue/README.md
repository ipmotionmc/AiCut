# @aicut/vue

Vue 3 wrapper around `@aicut/core`.

```vue
<script setup lang="ts">
import { ref } from "vue";
import { VideoEditor, type EditorApi } from "@aicut/vue";
import "@aicut/core/styles.css";

const editorRef = ref<{ api: () => EditorApi | null } | null>(null);

function save(project) {
  localStorage.setItem("project", JSON.stringify(project));
}

function exportNow(project) {
  fetch("/api/export", { method: "POST", body: JSON.stringify(project) });
}
</script>

<template>
  <VideoEditor
    ref="editorRef"
    :default-project="project"
    @change="save"
    @export="exportNow"
    style="height: 600px"
  />
</template>
```

Call `editorRef.value?.api()?.setProject(saved)` to restore a project.
