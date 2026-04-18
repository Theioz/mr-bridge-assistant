/**
 * Canonical result shape for state-mutating chat tools (issue #319).
 *
 * Every mutating tool returns one of these so the model can reliably
 * distinguish "the action happened" from "the action didn't happen",
 * and so the synthesizer fallback in /api/chat's onFinish never claims
 * success for a failed tool result.
 *
 * Read-only tools (get_*, list_*) may return arbitrary shapes — they
 * only use { error } on failure.
 */

export type OkResult<T> = { ok: true } & T;
export type ErrResult = { ok: false; error: string };

export function ok<T extends Record<string, unknown>>(data: T): OkResult<T> {
  return { ok: true, ...data };
}

export function err(message: string): ErrResult {
  return { ok: false, error: message };
}
