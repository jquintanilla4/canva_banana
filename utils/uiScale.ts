export const DEFAULT_UI_SCALE = 0.8; // Matches the default "zoom out twice" feel.
export const DEFAULT_ROOT_FONT_SIZE_PX = 16; // Browser default root font size baseline.
export const APP_UI_SCALE_CSS_VAR = '--app-ui-scale'; // Shared CSS variable for UI scale.
export const APP_ROOT_FONT_SIZE_CSS_VAR = '--app-root-font-size'; // Shared CSS variable for root rem sizing.

export const getRootFontSizePx = (): number => {
  if (typeof window === 'undefined') {
    return DEFAULT_ROOT_FONT_SIZE_PX;
  }

  const parsedValue = parseFloat(window.getComputedStyle(document.documentElement).fontSize || `${DEFAULT_ROOT_FONT_SIZE_PX}`);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : DEFAULT_ROOT_FONT_SIZE_PX;
};

export const applyDefaultUiScale = (doc: Document): void => {
  const root = doc.documentElement;
  const scaledRootFontSizePx = DEFAULT_ROOT_FONT_SIZE_PX * DEFAULT_UI_SCALE;

  root.style.setProperty(APP_UI_SCALE_CSS_VAR, `${DEFAULT_UI_SCALE}`); // Expose the shared scale for CSS consumers.
  root.style.setProperty(APP_ROOT_FONT_SIZE_CSS_VAR, `${scaledRootFontSizePx}px`); // Drive rem sizing from the shared scale.
};
