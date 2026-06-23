import type { Project } from "./types.js";

/**
 * Snapshot-based undo/redo. Each mutation pushes the *previous*
 * project onto the undo stack and clears redo. Cheap enough for
 * v1: deep cloning a project JSON of a few dozen clips is O(<1ms).
 *
 * Capped to prevent unbounded memory growth on long sessions.
 */
export class HistoryStack {
  private undoStack: Project[] = [];
  private redoStack: Project[] = [];
  private readonly limit: number;

  constructor(limit = 50) {
    this.limit = limit;
  }

  /** Call BEFORE applying a mutation. */
  push(previous: Project): void {
    this.undoStack.push(clone(previous));
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** Returns the project to restore, or null if nothing to undo. */
  undo(current: Project): Project | null {
    const prev = this.undoStack.pop();
    if (!prev) return null;
    this.redoStack.push(clone(current));
    return prev;
  }

  redo(current: Project): Project | null {
    const next = this.redoStack.pop();
    if (!next) return null;
    this.undoStack.push(clone(current));
    return next;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}

function clone(p: Project): Project {
  return JSON.parse(JSON.stringify(p)) as Project;
}
