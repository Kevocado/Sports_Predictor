// Numbers on the track record page.
//
// ONE rule holds everywhere in this file: a value the API hands over as
// `null` prints as an em-dash, and never as "NaN", never as "0", never as a
// blank cell. pydantic 2.13.5 serialises NaN to null, so a `null` on this
// payload means "the tracker never measured this" -- the same distinction the
// backend draws, where an ungraded market is `None` and not 0.0 because 0% is
// a legible claim that every game in a week was missed. The vendored BoxScore
// has the same rule (components/BoxScore.tsx::cellText); this is the same
// guard for the track record's own numbers.
//
// The other direction matters just as much, and is the reason the shared
// `pct()` in predictor-ui/fmt.ts is NOT used for a hit rate: that one prints
// "<1%" and ">99%" on the grounds that a *live probability* never reads 0% or
// 100%. A track record is not a live probability. One game, one correct
// pick, is 100% -- and that 100% is the number B2 exists to stop anybody
// dividing away, so `rate()` prints "100%" for it and lets the count beside it
// say how thin the evidence is.
//
// 0 is a real measurement in the same way. A Brier score of 0.000, a 0.0-point
// error and a 0% hit rate are all facts about a week that WAS tracked, and
// none of them may read as missing.

const MINUS = "−";
const DASH = "—";

/**
 * True for anything that must not be printed as a number: `null`, `undefined`,
 * `NaN`, and `±Infinity`. `Number.isFinite` is what catches the last three;
 * `x == null` catches the first two in one comparison.
 *
 * Exported because a caller has to know whether to draw a bar at all, not just
 * what to print inside it: an absent accuracy is not a 0% accuracy.
 */
export function missing(x: number | null | undefined): x is null | undefined {
  return x == null || !Number.isFinite(x);
}

/** A rate in 0..1 as a whole percent. "0%" and "100%" are real, so they print. */
export function rate(x: number | null | undefined): string {
  return missing(x) ? DASH : `${Math.round(x * 100)}%`;
}

/** A quantity in points or yards, one decimal. */
export function points(x: number | null | undefined): string {
  return missing(x) ? DASH : oneDecimal(x);
}

/** The same quantity with its direction kept: "+6.7", "−4.0", "0.0". */
export function signedPoints(x: number | null | undefined): string {
  if (missing(x)) return DASH;
  const r = +x.toFixed(1);
  if (r > 0) return `+${r.toFixed(1)}`;
  if (r < 0) return `${MINUS}${Math.abs(r).toFixed(1)}`;
  return "0.0";
}

/** A Brier score. Three decimals, because 0.18 and 0.184 are different models. */
export function brier(x: number | null | undefined): string {
  if (missing(x)) return DASH;
  const r = +x.toFixed(3);
  return r < 0 ? `${MINUS}${Math.abs(r).toFixed(3)}` : r.toFixed(3);
}

function oneDecimal(x: number): string {
  const r = +x.toFixed(1);
  return r < 0 ? `${MINUS}${Math.abs(r).toFixed(1)}` : r.toFixed(1);
}

/**
 * Which way a signed error points, in words.
 *
 * This exists so no number on the page carries its meaning in a sign and a
 * colour alone. A `+6.7` next to nothing else is a direction a reader has to
 * already know; "over-forecast" is the same fact in words, and it is the word
 * that a screen reader gets too.
 */
export function biasWord(x: number | null | undefined): string {
  if (missing(x)) return "not measured";
  if (Math.abs(x) < 0.05) return "no systematic drift either way";
  return x > 0 ? "over-forecast on average" : "under-forecast on average";
}

/**
 * Which side of the closing line the model's probability sits on, in words.
 *
 * Deliberately not "beat the line" or anything with money in it. The number
 * is a disagreement between two probabilities, in percentage points, and the
 * backend's own `vs_market.method.edge` string says so on this page. A
 * well-calibrated model sits at "level with the line" most of the time, and
 * this wording does not pretend otherwise.
 */
export function edgeWord(x: number | null | undefined): string {
  if (missing(x)) return "not measured";
  if (Math.abs(x) < 0.05) return "level with the line";
  return x > 0 ? "the model's probability sits above the line's" : "the model's probability sits below the line's";
}

/** "1 game" / "12 games". Thousands separated, so the digits line up in a column. */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
}

/**
 * The count behind a rate, said out loud next to it.
 *
 * A backend that does not report the count (`n` absent) gets a sentence that
 * says so. It does NOT get the games-resolved figure as a stand-in: for ATS
 * and totals the denominator is the graded subset, not the row count, and
 * printing the row count there is the exact B1 mistake of a rate with the
 * wrong denominator beside it.
 */
export function gradedCount(n: number | undefined | null, noun = "game"): string {
  if (n == null || !Number.isFinite(n)) return "grade count not reported";
  return `${plural(n, noun)} graded`;
}

/** "—", for a table cell whose number is absent. Exported so tests read as prose. */
export const NO_VALUE = DASH;
