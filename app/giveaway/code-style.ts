/**
 * Shared Lexend code-row styles for the reel and the fit-to-frame measuring span.
 * Keep these in sync so measured width matches what the drum renders.
 */

export const CODE_FONT_FAMILY = "Lexend, ui-sans-serif, system-ui, sans-serif";
export const CODE_FONT_WEIGHT = "600";
export const CODE_LETTER_SPACING = "0.04em";
export const CODE_COLOR = "#0F2A44";

/**
 * Apply the measure/render typeface to a span or reel row.
 */
export function applyCodeTypeStyles(el: HTMLElement): void {
  el.style.fontFamily = CODE_FONT_FAMILY;
  el.style.fontWeight = CODE_FONT_WEIGHT;
  el.style.letterSpacing = CODE_LETTER_SPACING;
  el.style.fontVariantNumeric = "tabular-nums";
  el.style.whiteSpace = "nowrap";
  el.style.color = CODE_COLOR;
}

/**
 * Drum side-row opacity: 1 at centre, 0.28 one row away, 0 at two rows.
 */
export function drumRowOpacity(absD: number): number {
  if (absD <= 1) return 1 - absD * (1 - 0.28);
  if (absD <= 2) return 0.28 * (2 - absD);
  return 0;
}
