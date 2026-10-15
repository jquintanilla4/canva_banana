import { PROMPT_BAR_FOOTER_MARGIN_BOTTOM } from './promptBarFooterLayout';

// Shared geometry for the edge-docked side panels (prompt chat on the left, notes on the
// right) so the two stay visually symmetric from a single source of truth.
export const SIDE_PANEL_WIDTH = 'clamp(380px, 33vw, 620px)'; // Keep each overlay near one-third of desktop width.
export const SIDE_PANEL_EDGE_INSET = '0.625rem'; // Leaves a visible edge away from the app window.
export const SIDE_PANEL_TOP_OFFSET = 'calc(3.25rem + 14px)'; // Aligns below the lower edge of the top toolbar.
export const SIDE_PANEL_BOTTOM_OFFSET = `calc(${PROMPT_BAR_FOOTER_MARGIN_BOTTOM} + 5px)`; // Lifts the panel to the prompt bar bottom edge.
export const SIDE_PANEL_TOGGLE_SIZE_REM = 2.64; // Matches the normal prompt bar submit button.
export const SIDE_PANEL_TOGGLE_VIEWPORT_GAP = '1rem'; // Keeps the toggle reachable on narrow screens.
