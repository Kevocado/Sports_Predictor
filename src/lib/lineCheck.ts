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

export interface LineOption { market: string; label: string; kind: "yardage" | "count" }

/** The stats this player can be checked on, in a stable order. */
/** The point projection is a MEAN (squared-error fit) and a yardage distribution is right-skewed, so its median sits below
 *  it by design (a back-up RB: mean 14, median 2). The two must not be compared directly. What is checkable is that the
 *  projection lies inside the distribution's own 10th-90th percentile band; one that falls outside it means the two
 *  disagree about the player (the 2026-10-15 defect: projection 86.9, 90th percentile 79.4). Such a stat is not offered. */
const Q10_INDEX = QUANTILE_LEVELS.indexOf(0.1);
const Q90_INDEX = QUANTILE_LEVELS.indexOf(0.9);

export function distributionAgreesWithProjection(p: PlayerPropPrediction, market: string, values: number[]): boolean {
  const projection = (p as unknown as Record<string, number | undefined>)[market];
  if (typeof projection !== "number" || !Number.isFinite(projection) || projection <= 0) return true;   // nothing to compare against
  return projection >= values[Q10_INDEX] && projection <= values[Q90_INDEX];
}

export function lineOptions(p: PlayerPropPrediction): LineOption[] {
  const out: LineOption[] = [];
  for (const [market, values] of Object.entries(p.line_check?.yardage ?? {})) {
    if (Array.isArray(values) && values.length === QUANTILE_LEVELS.length && distributionAgreesWithProjection(p, market, values)) {
      out.push({ market, label: MARKET_LABEL[market] ?? market, kind: "yardage" });
    }
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
    if (!distributionAgreesWithProjection(p, market, yardage)) return { status: "not-priced", reason: "The model's distribution for this player disagrees with its own projection, so it is not priced." };
    const pOver = pOverFromQuantiles(yardage, line);
    return { status: "ok", pOver, pUnder: 1 - pOver, edge: pOver >= P_OVER_CEILING ? "high" : pOver <= P_OVER_FLOOR ? "low" : null };
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


/** One player's Kalshi ladder for one stat, as served by /players/{season}/{week}/market-lines. */
export interface MarketRung { line: number; p_over: number; volume?: number | null }
export interface MarketLine { team: string; initial: string; last: string; stat: string; player?: string | null; rungs: MarketRung[] }

const lettersUpper = (x: string) => x.replace(/[^A-Za-z]/g, "").toUpperCase();

/** Kalshi's ladder for this player and stat, matched by team + first initial + last name ("J.Smith-Njigba" -> J / SMITHNJIGBA).
 *  A QB's `qb_rushing_yards` is Kalshi's plain rushing-yards market. Several matches (two players sharing an initial and a last
 *  name on one team) are refused rather than guessed. */
export function marketLadderFor(lines: MarketLine[] | null | undefined, p: PlayerPropPrediction, market: string): MarketRung[] {
  if (!lines || lines.length === 0) return [];
  const stat = market === "qb_rushing_yards" ? "rushing_yards" : market;
  // "J.Smith-Njigba" (the feed's form) or "Jaxon Smith-Njigba": first initial + everything after the first token.
  const dot = p.player_name.indexOf(".");
  const first = dot > 0 ? p.player_name.slice(0, dot) : p.player_name.trim().split(/\s+/)[0];
  const rest = dot > 0 ? p.player_name.slice(dot + 1) : p.player_name.trim().split(/\s+/).slice(1).join("");
  const initial = lettersUpper(first).slice(0, 1);
  const last = lettersUpper(rest);
  const hits = lines.filter((l) => l.team === p.recent_team && l.stat === stat && l.initial === initial && l.last === last);
  return hits.length === 1 ? hits[0].rungs : [];
}
