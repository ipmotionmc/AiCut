import { mergeLocale, type Locale } from "../i18n.js";
import { applyTheme } from "../theme.js";
import type { Theme } from "../types.js";
import { LightingControls } from "./controls.js";
import { mergeLightingLocale, type LightingLocale } from "./i18n.js";
import { normalize, PRESET_DIRECTIONS, snapToPreset } from "./presets.js";
import { LightingScene } from "./scene.js";
import {
  DEFAULT_LIGHTING_CONFIG,
  type LightingConfig,
  type LightingEditorOptions,
  type LightingView,
} from "./types.js";

/**
 * Top-level lighting picker. Mirrors `Editor`'s lifecycle — `static
 * create(opts)`, wipes the container, owns DOM + WebGL, exposes
 * `destroy()` and reactive `setTheme` / `setLocale`. Separate from
 * the video Editor; the two can coexist in the same host page.
 *
 * Layout (left → right):
 *   [scene 240px]  [controls 220px]  [smartSlot (drawer)]
 * The smart slot is host-supplied. Library renders a × close button
 * + a "Smart mode" toggle in the controls header when the slot is
 * available; `smartEnabled: false` removes the slot entirely.
 */
export class LightingEditor {
  private root: HTMLElement;
  private opts: LightingEditorOptions;
  private config: LightingConfig;
  private view: LightingView;
  private locale: Locale & LightingLocale;
  private smartEnabled: boolean;
  private smartOpen: boolean;

  private scene: LightingScene;
  private controls: LightingControls;
  private sceneViewport: HTMLDivElement;
  private viewToggleEl: HTMLDivElement;
  private body: HTMLDivElement;
  private smartWrapper: HTMLDivElement | null = null;
  private smartCloseBtn: HTMLButtonElement | null = null;
  private smartToggleEl: HTMLDivElement | null = null;
  private smartToggleThumb: HTMLDivElement | null = null;
  /** Host slot the React/Vue wrapper portals/teleports into. Stable
   *  reference across smartOpen toggles — only the wrapper around it
   *  collapses/expands. Always present even when `smartEnabled: false`
   *  so portals don't blow up; just detached from the visible tree. */
  readonly smartSlot: HTMLDivElement;

  private resizeObs: ResizeObserver | null = null;
  private destroyed = false;

  static create(opts: LightingEditorOptions): LightingEditor {
    return new LightingEditor(opts);
  }

  constructor(opts: LightingEditorOptions) {
    this.opts = opts;
    this.root = opts.container;
    this.config = { ...DEFAULT_LIGHTING_CONFIG, ...opts.config };
    this.view = opts.view ?? "perspective";
    this.smartEnabled = opts.smartEnabled !== false;
    this.smartOpen = opts.smartOpen !== false;
    this.locale = {
      ...mergeLocale(opts.locale),
      ...mergeLightingLocale(opts.locale),
    };

    this.root.classList.add("aicut-root", "aicut-lighting-editor");
    this.root.innerHTML = "";
    if (!this.root.style.position) this.root.style.position = "relative";
    applyTheme(this.root, opts.theme);

    // ---- Layout shell ----
    this.body = document.createElement("div");
    this.body.className = "aicut-lighting-body";
    this.root.appendChild(this.body);

    // Scene column
    const sceneCol = document.createElement("div");
    sceneCol.className = "aicut-lighting-scene-col";
    this.viewToggleEl = this.buildViewToggle();
    sceneCol.appendChild(this.viewToggleEl);
    this.sceneViewport = document.createElement("div");
    this.sceneViewport.className = "aicut-lighting-scene-viewport";
    this.sceneViewport.setAttribute("data-testid", "aicut-lighting-scene");
    sceneCol.appendChild(this.sceneViewport);
    this.body.appendChild(sceneCol);

    // Controls column
    this.controls = new LightingControls(this.locale, {
      onBrightnessChange: (level) => this.applyMutation({ brightness: level }),
      onColorChange: (hex) => this.applyMutation({ color: hex }),
      onKeyDirectionPick: (preset) =>
        this.applyMutation({
          keyDirection: PRESET_DIRECTIONS[preset],
          keyPreset: preset,
        }),
      onRimToggle: (on) => this.applyMutation({ rim: on }),
      onReset: () => this.setConfig(DEFAULT_LIGHTING_CONFIG, "reset"),
    });
    this.body.appendChild(this.controls.root);

    // Smart slot — held as a stable ref even when not in the visible
    // tree, so React portals always have a valid mount target.
    this.smartSlot = document.createElement("div");
    this.smartSlot.className = "aicut-lighting-smart-slot";
    this.smartSlot.setAttribute("data-testid", "aicut-lighting-smart");

    if (this.smartEnabled) {
      this.smartWrapper = this.buildSmartWrapper();
      this.body.appendChild(this.smartWrapper);
      // Header smart-mode pill toggle (lets the user re-open after ×).
      this.smartToggleEl = this.buildSmartToggle();
      this.controls.headerSlot.appendChild(this.smartToggleEl);
    }

    this.syncSmartState();

    // ---- Scene mount ----
    this.scene = new LightingScene(this.sceneViewport, this.view);
    this.scene.setLightDirection(this.config.keyDirection);
    this.scene.setBrightness(this.config.brightness);
    this.scene.setLightColor(this.config.color);
    if (opts.subjectImageUrl) this.scene.setSubjectImage(opts.subjectImageUrl);
    this.scene.onLightDrag = (dir) => {
      const d = normalize(dir);
      this.applyMutation({ keyDirection: d, keyPreset: snapToPreset(d) });
    };

    this.controls.render(this.config);

    if (typeof ResizeObserver !== "undefined") {
      this.resizeObs = new ResizeObserver(() => {
        const rect = this.sceneViewport.getBoundingClientRect();
        const side = Math.min(rect.width, rect.height);
        if (side > 0) this.scene.setSize(side);
      });
      this.resizeObs.observe(this.sceneViewport);
    }
  }

  // ---- Public API ----------------------------------------------------

  getConfig(): LightingConfig {
    return { ...this.config, keyDirection: { ...this.config.keyDirection } };
  }

  setConfig(
    partial: Partial<LightingConfig>,
    _reason: "external" | "reset" = "external",
  ): void {
    const merged: LightingConfig = {
      ...this.config,
      ...partial,
      keyDirection: partial.keyDirection
        ? normalize(partial.keyDirection)
        : this.config.keyDirection,
    };
    if (partial.keyDirection && partial.keyPreset === undefined) {
      merged.keyPreset = snapToPreset(merged.keyDirection);
    }
    this.config = merged;
    this.scene.setLightDirection(this.config.keyDirection);
    this.scene.setBrightness(this.config.brightness);
    this.scene.setLightColor(this.config.color);
    this.controls.render(this.config);
    this.opts.onChange?.(this.getConfig());
  }

  setSubjectImage(url: string): void {
    this.opts.subjectImageUrl = url;
    this.scene.setSubjectImage(url);
  }

  setView(v: LightingView): void {
    if (v === this.view) return;
    this.view = v;
    this.scene.setView(v);
    this.syncViewToggle();
  }

  getView(): LightingView {
    return this.view;
  }

  /** Enable/disable the entire Smart Mode feature at runtime. */
  setSmartEnabled(enabled: boolean): void {
    if (enabled === this.smartEnabled) return;
    this.smartEnabled = enabled;
    if (enabled) {
      if (!this.smartWrapper) {
        this.smartWrapper = this.buildSmartWrapper();
        this.body.appendChild(this.smartWrapper);
      }
      if (!this.smartToggleEl) {
        this.smartToggleEl = this.buildSmartToggle();
        this.controls.headerSlot.appendChild(this.smartToggleEl);
      }
    } else {
      this.smartWrapper?.remove();
      this.smartWrapper = null;
      this.smartCloseBtn = null;
      this.smartToggleEl?.remove();
      this.smartToggleEl = null;
      this.smartToggleThumb = null;
    }
    this.syncSmartState();
  }

  isSmartEnabled(): boolean {
    return this.smartEnabled;
  }

  /** Open/close the smart slot drawer when enabled. No-op when disabled. */
  setSmartOpen(open: boolean): void {
    if (!this.smartEnabled || open === this.smartOpen) return;
    this.smartOpen = open;
    this.syncSmartState();
    this.opts.onSmartOpenChange?.(open);
  }

  isSmartOpen(): boolean {
    return this.smartOpen;
  }

  setTheme(theme: Theme): void {
    applyTheme(this.root, theme);
  }

  setLocale(locale: Partial<Locale & LightingLocale>): void {
    this.locale = {
      ...mergeLocale(locale),
      ...mergeLightingLocale(locale),
    };
    this.controls.setLocale(this.locale);
    this.syncViewToggle();
    this.syncSmartLocale();
  }

  requestGenerate(): void {
    this.opts.onGenerate?.(this.getConfig());
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resizeObs?.disconnect();
    this.scene.destroy();
    this.root.innerHTML = "";
    this.root.classList.remove("aicut-root", "aicut-lighting-editor");
    this.root.removeAttribute("data-smart-enabled");
    this.root.removeAttribute("data-smart-open");
  }

  // ---- Internal ------------------------------------------------------

  private applyMutation(partial: Partial<LightingConfig>): void {
    const merged: LightingConfig = {
      ...this.config,
      ...partial,
      keyDirection: partial.keyDirection
        ? normalize(partial.keyDirection)
        : this.config.keyDirection,
    };
    this.config = merged;
    this.scene.setLightDirection(this.config.keyDirection);
    if (partial.brightness !== undefined)
      this.scene.setBrightness(this.config.brightness);
    if (partial.color !== undefined)
      this.scene.setLightColor(this.config.color);
    this.controls.render(this.config);
    this.opts.onChange?.(this.getConfig());
  }

  private buildViewToggle(): HTMLDivElement {
    const wrap = document.createElement("div");
    wrap.className = "aicut-lighting-view-toggle";
    wrap.setAttribute("data-active", this.view);

    const mk = (v: LightingView, label: string): HTMLButtonElement => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "aicut-lighting-view-opt";
      b.textContent = label;
      b.setAttribute("data-view", v);
      b.setAttribute("data-testid", `aicut-lighting-view-${v}`);
      if (v === this.view) b.classList.add("active");
      b.addEventListener("click", () => this.setView(v));
      return b;
    };
    wrap.appendChild(mk("perspective", this.locale.lightingViewPerspective));
    wrap.appendChild(mk("front", this.locale.lightingViewFront));
    return wrap;
  }

  private syncViewToggle(): void {
    this.viewToggleEl.setAttribute("data-active", this.view);
    for (const btn of Array.from(
      this.viewToggleEl.querySelectorAll<HTMLButtonElement>(
        ".aicut-lighting-view-opt",
      ),
    )) {
      const v = btn.getAttribute("data-view") as LightingView | null;
      btn.classList.toggle("active", v === this.view);
      if (v === "perspective") btn.textContent = this.locale.lightingViewPerspective;
      if (v === "front") btn.textContent = this.locale.lightingViewFront;
    }
  }

  /**
   * Build the smart slot column wrapper: × close button + the actual
   * host slot. Wrapper handles the drawer animation; slot reference
   * stays stable so portals don't have to relocate.
   */
  private buildSmartWrapper(): HTMLDivElement {
    const wrap = document.createElement("div");
    wrap.className = "aicut-lighting-smart-wrapper";

    this.smartCloseBtn = document.createElement("button");
    this.smartCloseBtn.type = "button";
    this.smartCloseBtn.className = "aicut-lighting-smart-close";
    this.smartCloseBtn.title = this.locale.lightingSmartClose;
    this.smartCloseBtn.setAttribute("aria-label", this.locale.lightingSmartClose);
    this.smartCloseBtn.setAttribute("data-testid", "aicut-lighting-smart-close");
    this.smartCloseBtn.innerHTML = "&times;";
    this.smartCloseBtn.addEventListener("click", () => this.setSmartOpen(false));
    wrap.appendChild(this.smartCloseBtn);

    wrap.appendChild(this.smartSlot);
    return wrap;
  }

  /** Pill-style toggle that lives in the controls header. Re-opens
   *  the smart drawer when the host has closed it via ×. */
  private buildSmartToggle(): HTMLDivElement {
    const row = document.createElement("div");
    row.className = "aicut-lighting-smart-toggle-row";

    const label = document.createElement("span");
    label.className = "aicut-lighting-smart-toggle-label";
    label.textContent = this.locale.lightingSmartToggle;
    row.appendChild(label);

    const toggle = document.createElement("div");
    toggle.className = "aicut-lighting-toggle aicut-lighting-smart-toggle";
    toggle.setAttribute("role", "switch");
    toggle.setAttribute("tabindex", "0");
    toggle.setAttribute("data-testid", "aicut-lighting-smart-toggle");
    toggle.title = this.locale.lightingSmartToggle;

    this.smartToggleThumb = document.createElement("div");
    this.smartToggleThumb.className = "aicut-lighting-toggle-thumb";
    toggle.appendChild(this.smartToggleThumb);

    toggle.addEventListener("click", () => this.setSmartOpen(!this.smartOpen));
    row.appendChild(toggle);
    return row;
  }

  /** Re-translate smart-related labels after a locale swap. */
  private syncSmartLocale(): void {
    if (this.smartCloseBtn) {
      this.smartCloseBtn.title = this.locale.lightingSmartClose;
      this.smartCloseBtn.setAttribute("aria-label", this.locale.lightingSmartClose);
    }
    if (this.smartToggleEl) {
      const label = this.smartToggleEl.querySelector<HTMLSpanElement>(
        ".aicut-lighting-smart-toggle-label",
      );
      if (label) label.textContent = this.locale.lightingSmartToggle;
      const toggle = this.smartToggleEl.querySelector<HTMLDivElement>(
        ".aicut-lighting-smart-toggle",
      );
      if (toggle) toggle.title = this.locale.lightingSmartToggle;
    }
  }

  /** Mirror smart state to data-* attrs + toggle thumb position.
   *  Drives the CSS that collapses the column when closed. */
  private syncSmartState(): void {
    this.root.setAttribute(
      "data-smart-enabled",
      this.smartEnabled ? "true" : "false",
    );
    this.root.setAttribute(
      "data-smart-open",
      this.smartOpen ? "true" : "false",
    );
    if (this.smartToggleEl) {
      const toggle = this.smartToggleEl.querySelector<HTMLDivElement>(
        ".aicut-lighting-smart-toggle",
      );
      if (toggle) {
        toggle.classList.toggle("active", this.smartOpen);
        toggle.setAttribute("aria-checked", this.smartOpen ? "true" : "false");
      }
    }
  }
}
