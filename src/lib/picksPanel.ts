// The data behind a `PicksList`: which rows, under which heading, and what each
// row says about itself.
//
// This module owns the WORDING. `PicksList` (the shared component) renders a
// probability as a bar and a projection as a number plus a margin, and composes
// no confidence sentence of its own -- deliberately, because no odds feed exists
// in any of these repos, so anything composed here could only be invented. Every
// sentence a reader sees on a picks row is assembled in this file, from measured
// fields, and each one says what the number IS rather than how good it is.
//
// Three measured facts shape all of it:
//
//  1. **No PL/NFL arm is calibrated.** There is no Platt scaler, isotonic
//     regressor or `CalibratedClassifierCV` anywhere in NFL's `src/` --
//     `anytime_td_prob` is a bare `XGBClassifier.predict_proba`. So a TD row
//     never leads with a headline hit rate. Where `/track-record` grades the arm
//     it shows the buckets (the graded context) and says the arm is uncalibrated;
//     where it grades nothing it says exactly that and stops.
//  2. **The scores sit below the truth.** The median served TD probability is
//     0.1482 across the live weeks, with only ~8.5% of rows at or above 0.50.
//     A bare "14.8%" therefore reads as a near-certain miss, which is the
//     opposite of what a 0.148 score on an arm that is under-confident means.
//     The bucket context is what makes the number readable; the headline alone
//     is not.
//  3. **CFB has no availability feed at all.** No `injuries.py`, no
//     `depth_charts.py`. So a CFB row says "no availability check" on every
//     row, and CFB's out list is empty by ABSENCE OF A FEED, which is a
//     different fact from nobody being out. A reader must not be able to tell
//     the two apart from the page.

import type { OutPlayer, PickRow } from "../predictor-ui";
import type { PlayerPropPrediction, PlayerPropsTrackRecord } from "../types";

/** Shown on every CFB row. Decision 5: the flag belongs on the row, because a
 *  reader who does not see it will read the list as "these players are playing".
 *  It states the absence of a check and nothing about any player's status. */
export const CFB_AVAILABILITY_NOTE = "no availability check";

/** Shown on a TD row when the backend has resolved nothing to grade. It must not
 *  become a hit rate of anything -- there is no such thing as a 0% record on an
 *  arm that has never been scored. */
export const NO_GRADED_RECORD_YET = "no graded record yet";

/** Said where CFB's out list is empty *because there is no feed to populate it*.
 *  The two clauses are load-bearing: the first names what is missing and the
 *  second explicitly refuses the reading a reader would otherwise take. */
export const CFB_NO_AVAILABILITY_LINE =
  "No availability check for this sport: there is no injury report or depth-chart feed to check against, " +
  "so no player above has been confirmed or ruled out. That is the absence of a check, not a claim that nobody is out.";

/** The asymmetry, stated on every TD row rather than in a footnote, and phrased
 *  in the units the reader is looking at.
 *
 *  Measured 2026-10-01 on the served weeks: median anytime-TD probability
 *  0.1482, with only ~8.5% of rows at or above 0.50, against a measured
 *  anytime-TD base rate of 0.2837. The arm is under-confident, so its scores sit
 *  systematically below the truth and a low score is the model's habit rather
 *  than a reading of the player. Without this sentence a 14.8% bar reads as a
 *  near-certain miss, which is the opposite of what the number means.
 *
 *  "at or above" rather than "or better": `better` is a comparative, and a
 *  comparative here would be a claim about the arm this panel refuses to make. */
const ASYMMETRY_NOTE =
  "raw score, uncalibrated, and this arm scores low: across the weeks served the median is 14.8% " +
  "and only 8.5% of rows reach 50% or above, so a low score is the model's habit, not a verdict on the player";

/** Said where NFL's out list is empty because the feed ran and listed nobody.
 *  Deliberately different wording from `CFB_NO_AVAILABILITY_LINE`: NFL's route
 *  answered 200 with an empty list, which is a real result. */
export const NFL_CHECKED_NOBODY_OUT =
  "Checked against the NFL official injury report for this week — nobody on these lists is listed Out.";

/** The per-position markets the model actually projects, transcribed from NFL
 *  and CFB `models/player_props.py::POSITION_MARKETS`.
 *
 *  One market per position on purpose, and only the yardage one: `POSITION_MARKETS`
 *  is a dict of lists and RB really does also get `carries` and WR/TE `receptions`
 *  (see `lib/playerRank.ts`, which documents this at length). Those markets are
 *  real and this panel does not rank them -- a picks list is three rows per
 *  heading, and adding a carries list beside a rushing list for the same
 *  position would be two categories for one player rather than a clearer one.
 *
 *  `targets` is absent and must stay absent: it is structurally NaN in CFB's
 *  source data (`data/player_stats.py`), so a targets figure could only ever be
 *  a fabrication. CFB has no such market and this phase must not grow one. */
/** One entry per position-group, each naming that group's OWN yardage market.
 *
 *  A named type rather than one derived from the function's return: `typeof
 *  positionCategories` is a FUNCTION, so indexing it needs a call signature and
 *  yields `never` under `tsc` -- which is exactly the kind of thing `vitest`
 *  (esbuild, no type checking) sails straight past. `npm run build` caught it. */
export interface PositionCategory {
  position: string | readonly string[];
  market: Market;
  category: string;
  detail: string;
}

export function positionCategories(): PositionCategory[] {
  return [
    { position: "QB", market: "passing_yards", category: "QB passing yards", detail: "Pass yds" },
    { position: "RB", market: "rushing_yards", category: "RB rushing yards", detail: "Rush yds" },
    { position: ["WR", "TE"], market: "receiving_yards", category: "WR/TE receiving yards", detail: "Rec yds" },
  ];
}

/** The yardage markets this panel ranks. Exactly the three the model projects a
 *  yardage figure in -- `carries` and `receptions` are real markets in both
 *  backends but are counts, not distances, and a second heading per position is
 *  not what a three-row list is for. `targets` is not here and must not be: it
 *  is structurally NaN in CFB's source data. */
type Market = "passing_yards" | "rushing_yards" | "receiving_yards";

const TD_CATEGORY = "Anytime TD";

/** The three-row ceiling, restated so this file cannot be the thing that drifts
 *  from the component's. It is a cap and never a quota: the rows are sliced, so
 *  a fourth player cannot appear to backfill a removed one. */
export const MAX_ROWS = 3;

export type Sport = "nfl" | "cfb";

export interface PicksPanelInput {
  sport: Sport;
  /** The week's `/props` rows. */
  props: PlayerPropPrediction[];
  /** NFL's `/players/{season}/{week}/out` entries. CFB has no such route and
   *  must not be handed any; see `buildPicksPanel`. */
  out?: { player_id: string; player_name: string; recent_team?: string; report_status?: string; source?: string; report_season?: number; report_week?: number }[];
  /** The sport's `/track-record` `player_props` block, for the provenance line. */
  track: PlayerPropsTrackRecord;
  /** The fixture. A player on a third team is not this game's pick. */
  game: { home_team: string; away_team: string };
}

export interface PicksPanel {
  title: string;
  categories: { category: string; rows: PickRow[] }[];
  out: OutPlayer[];
  /** The one line about availability, said once, above the out list. Never both
   *  and never neither: for CFB the absence of a feed is itself the fact. */
  availability: string;
}

// ---------------------------------------------------------------------------
// Provenance, assembled from measured fields.
// ---------------------------------------------------------------------------

/** Brier score to two decimals, or a dash when the backend reports none. */
function brier(x: number | null | undefined): string | null {
  return typeof x === "number" && Number.isFinite(x) ? x.toFixed(2) : null;
}

function pct(x: number): string {
  return `${Math.round(x * 1000) / 10}%`;
}

/**
 * A TD row's provenance, and the only honest shape for an uncalibrated arm.
 *
 * Graded (the backend has resolved rows): the bucket context and the Brier
 * score, with the count of resolved rows they were measured over, plus the
 * statement that the score itself is uncalibrated. The Brier score is the one
 * figure here that is directly comparable to a coin flip (0.25), so it is worth
 * showing; the bucket hit rates are shown as the graded behaviour of the arm
 * rather than as a forecast.
 *
 * Ungraded: `NO_GRADED_RECORD_YET`, alone. It is tempting to fall back to the
 * buckets, and this used to: with `n_resolved: 0` every bucket is `n: 0,
 * hit_rate: null`, so the fallback printed "0% of 0 graded rows" -- a hit rate
 * of zero, which is a claim about accuracy that no data supports. "no graded
 * record yet" is what the situation is.
 */
export function tdProvenance(track: PlayerPropsTrackRecord, sport: Sport): string {
  const td = track.anytime_td;
  const parts: string[] = [ASYMMETRY_NOTE];

  if (!td || td.n_resolved <= 0) {
    parts.push(NO_GRADED_RECORD_YET);
  } else {
    const b = brier(td.brier_score);
    parts.push(`graded${b ? ` · Brier ${b}` : ""} over ${td.n_resolved} resolved props`);
    // The bucket context, in the reader's own units: what happened to the rows
    // the model had already put in each confidence bucket. `graded` is
    // deliberate -- these are outcomes of past calls, not a forecast about this
    // one, and the bucket labels are the backend's own so this row and the
    // track-record page cannot be read as two different numbers.
    const buckets = (td.confidence_buckets ?? []).filter((x) => x.n > 0 && x.hit_rate != null);
    parts.push(
      buckets.length > 0
        ? `graded by confidence bucket: ${buckets.map((x) => `${x.label} scored ${pct(x.hit_rate!)}`).join(", ")}`
        : "no confidence bucket has enough graded rows to report a rate",
    );
  }

  if (sport === "cfb") parts.push(CFB_AVAILABILITY_NOTE);
  return parts.join(" · ");
}

/**
 * A yardage row's provenance: the market's own graded error, when one exists.
 *
 * The ± the component draws comes from `margin`, not from this sentence -- this
 * exists to name where the number is from. With no MAE the margin is absent and
 * `PicksList` says "no error estimate yet"; this says the same thing in words
 * rather than leaving the reader to infer it from a missing figure.
 */
function yardageProvenance(
  track: PlayerPropsTrackRecord,
  market: Market,
  position: string,
  sport: Sport,
): string {
  const rec = track[market];
  const mae = positionMae(rec, position);
  const parts: string[] = [];
  if (rec && rec.n_resolved > 0 && typeof mae === "number" && Number.isFinite(mae)) {
    parts.push(`± is the market's own graded error over ${rec.n_resolved} resolved props`);
  } else {
    parts.push("no error estimate yet — this market has no resolved props to measure against");
  }
  if (sport === "cfb") parts.push(CFB_AVAILABILITY_NOTE);
  return parts.join(" · ");
}

/**
 * One position's MAE inside a market, reading BOTH of the backends' shapes.
 *
 * NFL emits `by_position` as a LIST of `{position, n_resolved,
 * mean_absolute_error}`; CFB emits `mae_by_position` as a bare
 * `Record<string, number>` with no count beside it (`tracking/store.py`, both at
 * their merged SHAs). Reading only one shape returns `undefined` for the other
 * sport, which would render a perfectly good ± as "no error estimate yet" on
 * half the rows -- a false statement about the model in the pessimistic
 * direction, so both are read here.
 */
function positionMae(
  rec: PlayerPropsTrackRecord[Market] | undefined,
  position: string,
): number | null {
  if (!rec) return null;
  const list = rec.by_position;
  if (Array.isArray(list)) {
    const row = list.find((x) => x.position === position);
    const v = row?.mean_absolute_error;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  const map = rec.mae_by_position;
  if (map && typeof map === "object") {
    const v = map[position];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The panel.
// ---------------------------------------------------------------------------

/** In words, never an epoch. NFL#24's out entries carry `report_season` and
 *  `report_week` rather than a timestamp, so the date is the week the report
 *  covered -- which is the moment the claim was true, and is therefore the
 *  honest thing to date a removal by. */
function datedFor(entry: { report_season?: number; report_week?: number; source?: string }): string {
  if (typeof entry.report_season === "number" && typeof entry.report_week === "number") {
    return `reported for the ${entry.report_season} season, week ${entry.report_week}`;
  }
  return "the week of this fixture";
}

export function buildPicksPanel({ sport, props, out, track, game }: PicksPanelInput): PicksPanel {
  // This game's players only. A week's `/props` carries every team in the
  // league; ranking a third team's quarterback under this fixture's heading
  // would be the same category error as putting a rebounds row under points.
  const inGame = props.filter((p) => p.recent_team === game.home_team || p.recent_team === game.away_team);
  // Every id this fixture could rank, taken BEFORE the gate. This is the set an
  // out entry must be a member of to be reported: an entry for a player who was
  // never in this fixture's slate describes no removal that happened on screen,
  // and naming one would attribute a removal to a fixture that never had one.
  //
  // Reading it off `ranked` instead (the gated list) is a bug this caught during
  // development: an out player is by construction absent from `ranked`, so the
  // membership test rejected every real out entry and the out list came out
  // empty while the player was correctly missing from every ranking -- silently
  // leaving a reader with no explanation for a name that vanished.
  const inGameIds = new Set(inGame.map((p) => String(p.player_id)));

  // The gate, applied HERE and to every market at once.
  //
  // An out player leaves the ranking entirely: no bar, no tile, no rank slot,
  // and nothing swapped in behind him. The removal keys on `player_id` alone, so
  // it catches him in the anytime-TD list and in every yardage market his
  // position has -- a check that only looked at one market would still rank him
  // somewhere else, which is the "flagged in place" state the spec forbids.
  //
  // Only a status that means he is not playing removes him. Doubtful and
  // Questionable do not: dropping a questionable player asserts something the
  // report does not say.
  const outIds = new Set(
    (out ?? [])
      .filter((e) => (e.report_status ?? "out").trim().toLowerCase() === "out")
      .map((e) => String(e.player_id)),
  );
  const ranked = inGame.filter((p) => !outIds.has(String(p.player_id)));

  // An out entry for a player who is not in this fixture's slate is not an out
  // player OF THIS FIXTURE. Naming one would attribute a removal that never
  // happened on screen, so it is dropped rather than reported.
  const relevantOut = (out ?? []).filter((e) => outIds.has(String(e.player_id)) && inGameIds.has(String(e.player_id)));

  const categories: { category: string; rows: PickRow[] }[] = [];

  // Anytime TD: for EVERY position the model projects (NFL and CFB's
  // `predict_props` emit `anytime_td_prob` for all of them), so this list is
  // cross-position and ranked on the probability itself.
  const tdRows = ranked
    .filter((p) => typeof p.anytime_td_prob === "number" && Number.isFinite(p.anytime_td_prob))
    .sort((a, b) => b.anytime_td_prob - a.anytime_td_prob)
    .slice(0, MAX_ROWS)
    .map<PickRow>((p) => ({
      key: `td-${p.player_id}`,
      name: p.player_name,
      team: p.recent_team,
      detail: "Anytime TD",
      value: p.anytime_td_prob,
      kind: "probability",
      provenance: tdProvenance(track, sport),
    }));
  if (tdRows.length > 0) categories.push({ category: TD_CATEGORY, rows: tdRows });

  // One heading per position, each carrying that position's OWN yardage market
  // and nothing else. A category with no rows is not a category, so a position
  // nobody from this fixture plays never appears as an empty heading.
  for (const spec of positionCategories()) {
    const positions = typeof spec.position === "string" ? [spec.position] : [...spec.position];
    const rows = ranked
      .filter((p) => positions.includes(p.position))
      .map((p) => ({ p, value: p[spec.market] }))
      .filter((x): x is { p: PlayerPropPrediction; value: number } => typeof x.value === "number" && Number.isFinite(x.value))
      .sort((a, b) => b.value - a.value || b.p.anytime_td_prob - a.p.anytime_td_prob)
      .slice(0, MAX_ROWS)
      .map<PickRow>(({ p, value }) => {
        const mae = positionMae(track[spec.market], p.position);
        const row: PickRow = {
          key: `${spec.market}-${p.player_id}`,
          name: p.player_name,
          team: p.recent_team,
          detail: spec.detail,
          value,
          kind: "projection",
          provenance: yardageProvenance(track, spec.market, p.position, sport),
        };
        // Absent, never zero: `PicksList` renders an absent margin as "no error
        // estimate yet", and a `0` would render as "± 0" -- a claim of perfect
        // accuracy that no backend has measured.
        if (typeof mae === "number" && Number.isFinite(mae)) row.margin = mae;
        return row;
      });
    if (rows.length > 0) categories.push({ category: spec.category, rows });
  }

  const outPlayers: OutPlayer[] = relevantOut.map((e) => ({
    name: e.player_name,
    ...(e.recent_team ? { team: e.recent_team } : {}),
    source: e.source ?? "official injury report",
    dated: datedFor(e),
  }));

  // The availability line. CFB has no feed to check against, so its line says
  // so and refuses the reading; NFL's route ran, so an empty list is a result.
  // CFB is handed `out` defensively anyway -- it has no `/out` route, so any
  // entry it receives is ignored rather than rendered.
  const availability =
    sport === "cfb"
      ? CFB_NO_AVAILABILITY_LINE
      : outPlayers.length > 0
        ? `Checked against the NFL official injury report — ${outPlayers.length} player${outPlayers.length === 1 ? "" : "s"} removed from these lists.`
        : NFL_CHECKED_NOBODY_OUT;

  return {
    title: "Model's top calls",
    categories,
    out: sport === "cfb" ? [] : outPlayers,
    availability,
  };
}
/** A record with nothing in it -- the shape both backends serve for a market
 *  with no resolved rows, and what this panel substitutes when `/track-record`
 *  itself could not be read.
 *
 *  Substituting it rather than hiding the list is the point: the alternative is
 *  a failing record endpoint silently removing the model's picks from the page,
 *  which reads as "there are no calls to make" rather than "there is no context
 *  for these calls". Every market reports `n_resolved: 0` and a null MAE, so a
 *  yardage row's margin is absent and it says "no error estimate yet" -- again,
 *  the same sentence a real empty record produces. */
export const NO_GRADED_RECORD: PlayerPropsTrackRecord = {
  anytime_td: { n_resolved: 0, hit_rate_when_called: null, brier_score: null, confidence_buckets: [] },
  passing_yards: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null },
  rushing_yards: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null },
  receiving_yards: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null },
};
