// Where a long free-text note gets cut in the UI. Separate from the component that renders it
// so it can be unit-tested — the node test runner cannot load a .tsx file.
//
// Notes on plans, sessions and inventory rows are written long on purpose: they carry the
// reasoning behind a decision so a later session reads it back instead of re-deriving it.
// Truncating them in the DATABASE would throw that away, so they stay whole there and are
// clamped here.

/** Lines shown before the note is cut. About one phone line of context. */
export const NOTE_CLAMP_LINES = 2;

// Roughly two lines at --t-micro on a 390px viewport. Below this a note already fits and a
// "more" control would be pure noise, so no toggle is rendered.
//
// A character count rather than a measured height, deliberately: measuring needs a layout
// effect, which paints the full note for one frame before collapsing it — the exact flash
// this exists to prevent.
export const NOTE_CLAMP_CHARS = 140;

export function shouldClampNote(
  text: string | null | undefined,
  limit: number = NOTE_CLAMP_CHARS,
): boolean {
  return (text ?? "").trim().length > limit;
}
