// The line checker's arithmetic: a reader types a sportsbook line, we answer with OUR probability of the over.
//
// Yardage markets ship the model's fitted quantile values (`line_check.yardage[market]`, in QUANTILE_LEVELS order);
// the answer is interpolated between them exactly as the backend's `p_over_from_quantiles` does, including the
// 0.02 / 0.98 clamp and the repair of crossing quantiles. Receptions ship a ready table for half-point lines.
// Nothing here estimates a distribution of its own.
import type { PlayerPropPrediction } from "../types";

/** The levels the 19 shipped values correspond to (backend `player_props.QUANTILES`). */
export const QUANTILE_LEVELS = [0.01, 0.02, 0.03, 0.04, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95, 0.96, 0.97, 0.98, 0.99];
export const P_OVER_FLOOR = 0.02;
export const P_OVER_CEILING = 0.98;

export const MARKET_LABEL: Record<string, string> = {
  passing_yards: "Passing yards",
  rushing_yards: "Rushing yards",
  receiving_yards: "Receiving yards",
  qb_rushing_yards: "QB rushing yards",
  receptions: "Receptions",
};

/**
 * Back-test correction for the yardage answers (raw model probability -> what actually happened).
 *
 * Built from 166k over/under situations in the walk-forward (lines at 70%-130% of the projection and at the player's trailing
 * mean, seasons 2022-2025, each season scored by models trained on earlier seasons): isotonic fit of "did he go over" on the
 * model's P(over). Fitted on 2022-2024 and checked on 2025 it cut the worst bucket gap from 0.080 to 0.041 and improved
 * Brier skill (0.0451 -> 0.0464); a stated 71% had really happened 66% of the time. The final table below is fitted on all four
 * seasons. It only softens overconfidence, so it never makes a claim the model did not already make. Receptions (ZINB) are
 * not remapped: that model has its own calibration gate.
 */
export const CALIBRATION_KNOTS: [number, number][] = [[0.02, 0.025], [0.06, 0.143], [0.1, 0.143], [0.14, 0.143], [0.18, 0.187], [0.22, 0.24], [0.26, 0.265], [0.3, 0.327], [0.34, 0.34], [0.38, 0.382], [0.42, 0.411], [0.46, 0.45], [0.5, 0.49], [0.54, 0.504], [0.58, 0.561], [0.62, 0.593], [0.66, 0.633], [0.7, 0.65], [0.74, 0.703], [0.78, 0.734], [0.82, 0.801], [0.86, 0.808], [0.9, 0.808], [0.94, 0.808], [0.98, 0.808]];

/** Piecewise-linear lookup in CALIBRATION_KNOTS; flat outside the first and last knot. */
export function calibrate(p: number): number {
  const k = CALIBRATION_KNOTS;
  if (p <= k[0][0]) return k[0][1];
  if (p >= k[k.length - 1][0]) return k[k.length - 1][1];
  for (let i = 0; i < k.length - 1; i++) {
    const [x0, y0] = k[i], [x1, y1] = k[i + 1];
    if (p >= x0 && p <= x1) return y0 + ((y1 - y0) * (p - x0)) / (x1 - x0);
  }
  return p;
}

export interface LineOption { market: string; label: string; kind: "yardage" | "count" }

/** The stats this player can be checked on, in a stable order. */
export function lineOptions(p: PlayerPropPrediction): LineOption[] {
  const out: LineOption[] = [];
  for (const [market, values] of Object.entries(p.line_check?.yardage ?? {})) {
    if (Array.isArray(values) && values.length === QUANTILE_LEVELS.length) out.push({ market, label: MARKET_LABEL[market] ?? market, kind: "yardage" });
  }
  for (const [market, table] of Object.entries(p.line_check?.counts ?? {})) {
    if (table && Object.keys(table).length > 0) out.push({ market, label: MARKET_LABEL[market] ?? market, kind: "count" });
  }
  return out;
}

/** P(actual > line) from ascending quantile values; same rule as the backend. */
export function pOverFromQuantiles(values: number[], line: number): number {
  const preds: number[] = [];
  for (const v of values) preds.push(preds.length ? Math.max(v, preds[preds.length - 1]) : v);
  if (line < preds[0]) return P_OVER_CEILING;
  if (line > preds[preds.length - 1]) return P_OVER_FLOOR;
  for (let i = 0; i < preds.length - 1; i++) {
    const [lo, hi] = [preds[i], preds[i + 1]];
    if (lo <= line && line <= hi) {
      const alpha = hi === lo ? QUANTILE_LEVELS[i] : QUANTILE_LEVELS[i] + (QUANTILE_LEVELS[i + 1] - QUANTILE_LEVELS[i]) * ((line - lo) / (hi - lo));
      return Math.min(P_OVER_CEILING, Math.max(P_OVER_FLOOR, 1 - alpha));
    }
  }
  return 0.5;
}

export type LineAnswer =
  | { status: "ok"; pOver: number; pUnder: number; edge: "low" | "high" | null }
  | { status: "need-half-point" }
  | { status: "not-priced"; reason: string }
  | { status: "invalid" };

/** Our answer for one player, one stat and a typed line. */
export function checkLine(p: PlayerPropPrediction, market: string, line: number): LineAnswer {
  if (!Number.isFinite(line) || line < 0) return { status: "invalid" };
  const yardage = p.line_check?.yardage?.[market];
  if (yardage && yardage.length === QUANTILE_LEVELS.length) {
    const raw = pOverFromQuantiles(yardage, line);
    const pOver = calibrate(raw);
    return { status: "ok", pOver, pUnder: 1 - pOver, edge: raw >= P_OVER_CEILING ? "high" : raw <= P_OVER_FLOOR ? "low" : null };
  }
  const table = p.line_check?.counts?.[market];
  if (table) {
    if (!Number.isInteger(line - 0.5)) return { status: "need-half-point" };
    const hit = table[String(line)];
    if (typeof hit !== "number") {
      const known = Object.keys(table).map(Number);
      return { status: "not-priced", reason: line > Math.max(...known) ? "That line is above what the model prices for this player." : "That line is outside the range the model prices." };
    }
    return { status: "ok", pOver: hit, pUnder: 1 - hit, edge: null };
  }
  return { status: "invalid" };
}
