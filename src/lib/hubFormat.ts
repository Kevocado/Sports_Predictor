// Data Hub number formats, on top of predictor-ui's fmt (true minus, dash
// for missing). EPA per play lives around ±0.2, so it needs two decimals
// where fmt.signed stops at one.
const MINUS = "−";
const DASH = "—";

const missing = (x: number | null | undefined): x is null | undefined =>
  x == null || !Number.isFinite(x);

export function epa(x: number | null): string {
  if (missing(x)) return DASH;
  const r = +x.toFixed(2);
  if (r > 0) return `+${r.toFixed(2)}`;
  if (r < 0) return `${MINUS}${Math.abs(r).toFixed(2)}`;
  return "0.00";
}

/** A share or rate (0–1) as a whole percent. */
export function share(x: number | null): string {
  return missing(x) ? DASH : `${Math.round(x * 100)}%`;
}

/** A whole-number margin, signed: turnovers ±. */
export function signedInt(x: number | null): string {
  if (missing(x)) return DASH;
  const r = Math.round(x);
  return r > 0 ? `+${r}` : r < 0 ? `${MINUS}${Math.abs(r)}` : "0";
}

/** One decimal for per-game rates, dash when missing. */
export function perGame(x: number | null): string {
  return missing(x) ? DASH : x.toFixed(1);
}
