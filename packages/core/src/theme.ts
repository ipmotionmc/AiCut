import type { Theme } from "./types.js";

/**
 * Map `Theme` keys to the CSS custom property they write.
 *
 * Brand/palette keys share names with iqvise's globals.css so hosts
 * that already define `--color-brand` etc. at the page level get the
 * editor in their palette for free — `theme` props ONLY needed when
 * scoping to this editor instance.
 *
 * Chrome keys keep the `--aicut-controls-*` prefix because they have
 * no analogue in the host palette.
 */
const THEME_VARS: Record<keyof Theme, string> = {
  brand: "--color-brand",
  secondary: "--color-secondary",
  surface: "--color-surface",
  dark: "--color-dark",
  muted: "--color-muted",
  card: "--color-card",
  success: "--color-success",
  warning: "--color-warning",
  info: "--color-info",
  error: "--color-error",
  controlsBg: "--aicut-controls-bg",
  controlsBorder: "--aicut-controls-border",
  controlsText: "--aicut-controls-text",
  controlsHover: "--aicut-controls-hover",
  controlsActive: "--aicut-controls-active",
  radiusSm: "--aicut-radius-sm",
  radiusMd: "--aicut-radius-md",
  radiusLg: "--aicut-radius-lg",
};

export function applyTheme(root: HTMLElement, theme: Theme | undefined): void {
  if (!theme) return;
  for (const key of Object.keys(theme) as Array<keyof Theme>) {
    const cssVar = THEME_VARS[key];
    const value = theme[key];
    if (cssVar && value) root.style.setProperty(cssVar, value);
  }
}
