export interface ClipMenuItem {
  /** Localized label, e.g. `locale.deleteClip`. */
  label: string;
  /** Right-aligned keyboard hint, e.g. "⌫". */
  kbd?: string;
  /** Paints the row in the destructive (red-tinted) style. */
  danger?: boolean;
  onSelect: () => void;
}

/**
 * Minimal right-click menu for timeline clips. DOM-based (the timeline
 * itself is canvas-only, but a menu needs real focus/hover/hit
 * semantics), themed via the same `--aicut-*` CSS variables as the
 * aspect-ratio popover, positioned `fixed` at the pointer so it
 * escapes the host's overflow clipping.
 *
 * One instance per Timeline; `open()` replaces any previous menu.
 */
export class ClipContextMenu {
  private host: HTMLElement;
  private menu: HTMLDivElement | null = null;
  private docPointerDown: ((e: PointerEvent) => void) | null = null;
  private docKey: ((e: KeyboardEvent) => void) | null = null;
  private docDismiss: (() => void) | null = null;

  constructor(host: HTMLElement) {
    this.host = host;
  }

  isOpen(): boolean {
    return this.menu !== null;
  }

  open(clientX: number, clientY: number, items: ClipMenuItem[]): void {
    this.close();
    if (items.length === 0) return;

    const menu = document.createElement("div");
    menu.className = "aicut-context-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("data-testid", "aicut-clip-context-menu");

    for (const item of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "aicut-context-menu-item" +
        (item.danger ? " aicut-context-menu-item-danger" : "");
      btn.setAttribute("role", "menuitem");
      const label = document.createElement("span");
      label.textContent = item.label;
      btn.appendChild(label);
      if (item.kbd) {
        const kbd = document.createElement("span");
        kbd.className = "aicut-context-menu-kbd";
        kbd.textContent = item.kbd;
        btn.appendChild(kbd);
      }
      // pointerdown would race the document-level dismiss listener;
      // click fires after both, once the press is unambiguous.
      btn.addEventListener("click", () => {
        this.close();
        item.onSelect();
      });
      menu.appendChild(btn);
    }

    // Mount inside the host so the menu inherits the host's `--aicut-*`
    // theme variables (they cascade through the DOM tree regardless of
    // the fixed positioning).
    this.host.appendChild(menu);
    // Clamp inside the viewport — a right-click near the bottom/right
    // edge should flip the menu inward rather than spawn scrollbars.
    const rect = menu.getBoundingClientRect();
    const x = Math.min(clientX, window.innerWidth - rect.width - 4);
    const y = Math.min(clientY, window.innerHeight - rect.height - 4);
    menu.style.left = `${Math.max(4, x)}px`;
    menu.style.top = `${Math.max(4, y)}px`;
    this.menu = menu;

    this.docPointerDown = (e) => {
      if (this.menu && e.target instanceof Node && this.menu.contains(e.target))
        return;
      this.close();
    };
    this.docKey = (e) => {
      if (e.key === "Escape") this.close();
    };
    this.docDismiss = () => this.close();
    document.addEventListener("pointerdown", this.docPointerDown, true);
    document.addEventListener("keydown", this.docKey, true);
    window.addEventListener("blur", this.docDismiss);
    window.addEventListener("resize", this.docDismiss);
    // Any scroll (page or nested container) invalidates the anchor point.
    document.addEventListener("scroll", this.docDismiss, true);
  }

  close(): void {
    if (this.docPointerDown) {
      document.removeEventListener("pointerdown", this.docPointerDown, true);
      this.docPointerDown = null;
    }
    if (this.docKey) {
      document.removeEventListener("keydown", this.docKey, true);
      this.docKey = null;
    }
    if (this.docDismiss) {
      window.removeEventListener("blur", this.docDismiss);
      window.removeEventListener("resize", this.docDismiss);
      document.removeEventListener("scroll", this.docDismiss, true);
      this.docDismiss = null;
    }
    this.menu?.remove();
    this.menu = null;
  }

  destroy(): void {
    this.close();
  }
}
