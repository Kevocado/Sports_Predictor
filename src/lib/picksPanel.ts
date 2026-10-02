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



/** Said where CFB's out list is empty *because there is no feed to populate it*.
 *  The two clauses are load-bearing: the first names what is missing and the
 *  second explicitly refuses the reading a reader would otherwise take. */
export const CFB_NO_AVAILABILITY_LINE =
  "No availability check for this sport: there is no injury report or depth-chart feed to check against, " +
  "so no player above has been confirmed or ruled out. That is the absence of a check, not a claim that nobody is out.";



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

// ---------------------------------------------------------------------------
// The two touchdown categories, and why they are not the same list.
// ---------------------------------------------------------------------------
//
// Kevin, 2026-10-01, binding: **anytime TD is rushing + receiving only**, and
// passing TDs are a market of their own. A quarterback therefore reaches the TD
// category only if his OWN rushing or receiving makes him likely, and his
// passing arm is never part of that number.
//
// The two backends do not agree on the label yet, and the title follows the
// number rather than the other way round. This was measured, not assumed:
//
//   * NFL_Predictor `origin/main` (NFL#26, e1c7d5e8) -- `features/player_usage.py`
//     line 39 records `ANYTIME_TD_LABEL_VERSION = 2`, whose definition is
//     `anytime_td_actual(rushing_tds, receiving_tds)` and no `passing_tds`. So
//     NFL's `anytime_td_prob` IS a rush-or-receive probability, and the honest
//     title for it is "Rush or receiving TD".
//   * CFB_Predictor `origin/main` (dfd3e21) -- `features/player_usage.py::build_player_training_frame`
//     still sums `rushing_tds + receiving_tds + passing_tds`. Renaming CFB's
//     category would put a label on a number that does not mean it, so CFB
//     keeps "Anytime TD" and this panel's QB gate below is NFL-only too.
//
// One constant cannot serve both, and the sport is the thing that decides which.

const NFL_TD_CATEGORY = "Rush or receiving TD";
const CFB_TD_CATEGORY = "Anytime TD";

/** The second TD heading, and the only market here whose number is not a yardage
 *  figure or a rush-or-receive probability: an over/under CALL on a line. */
const NFL_QB_PASSING_TD_CATEGORY = "QB passing TDs";

/** The provenance the shared `PicksList` draws after a rendered `detail`, in the
 *  caller's own words. This panel sets it on the QB passing-TD rows and nowhere
 *  else, and the reason it cannot be the component's default is the reason the
 *  row needs one at all.
 *
 *  `DEFAULT_DETAIL_LABEL` is "model call", and that noun is correct for what
 *  `value` is -- the model's own probability -- while being wrong for what
 *  `detail` IS on this row. The detail here is a THRESHOLD the call was made
 *  against: `model_line(mu)`, the nearest half point to the model's own
 *  projection, floored at 0.5. "Over 2.5 · model call" says the model called
 *  the over and stops one word short of saying where 2.5 came from, and a bare
 *  `2.5` under a totals heading is the exact shape of a sportsbook price. There
 *  is no odds feed anywhere in these repos, so nothing else on the page would
 *  tell a reader that apart -- a reader who assumes a price is reading a line
 *  the model chose for itself, and acting on it as though a book had quoted it.
 *
 *  "model line" is the plan's wording
 *  (`predictor-hub/docs/superpowers/plans/2026-10-02-nfl-td-finish.md`) and the
 *  one phrase here that is true of the number: it names the figure a line AND
 *  says the model chose it. It claims no edge, no price and no guarantee, so it
 *  needs no odds feed behind it.
 *
 *  Per row, not a prop on `PicksList`, because only these rows are lines: the TD
 *  rows restate their own heading and the yardage rows are projections, and
 *  neither reaches the qualifier. */
const NFL_QB_TD_DETAIL_LABEL = "model line";

/** The floor a quarterback's OWN rush-or-receive probability has to reach before
 *  this panel will list him under "Rush or receiving TD".
 *
 *  Kevin's rule is "only if his own rushing makes him likely", and `likely` is
 *  the operative word -- a quarterback whose rush-or-receive number sits at the
 *  base rate is not on this board because of his legs, and showing him there is
 *  the category error the whole split exists to remove.
 *
 *  Both ends of the range are numbers already measured and recorded in this
 *  repo rather than ones invented here: the header of this file puts the median
 *  served TD probability at **0.1482** across the live weeks (with only ~8.5% of
 *  rows at or above 0.50), and both backends' `/track-record` treats a pick as
 *  *called* at **0.50** (`hit_rate_when_called`, and the "50-60%" bucket in
 *  every graded week). 0.20 sits above the base rate and far below the called
 *  bar, so a genuine rushing receiver is not filtered out and a pure passer is.
 *
 *  This is the frontend's own eligibility floor. The load-bearing guarantee is
 *  upstream -- NFL's label does not contain passing TDs at all, so his arm
 *  cannot raise `anytime_td_prob` in the first place. The floor is what keeps
 *  that true on the page even if a payload ever grew a passing-contaminated
 *  number, and it is applied to QBs ONLY: applying it to every position would
 *  thin out the RB/WR list, which Kevin did not ask for and which would change
 *  CFB's panel. */
export const QB_RUSH_OR_RECEIVE_TD_MIN = 0.2;

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
// What the READER sees, and what is in the panel's data, are the same thing
// here, and it took two changes in two repos to get here.
//
// `PicksList` renders a row's name, its team, its value and -- for a
// probability -- a bar, and it draws `row.detail` ONLY when
// `rowShowsDetail(row, category)` says so: a `kind: "probability"` row whose
// detail adds a word its own heading does not already carry
// (`predictor-ui` PR #72, vendored at 7745af88d34b). The QB passing-TD row is
// the only row in this panel that clears both halves, which is why it is the
// only row a reader sees a `detail` on:
//
//   * "Rush or receiving TD" and "Anytime TD" are probability rows whose detail
//     IS the heading, restated -- nothing new to say, so nothing is drawn.
//   * "Pass yds", "Rush yds" and "Rec yds" are `kind: "projection"`. Their
//     detail is a label for a magnitude the heading already names, and a
//     projection states no call, so they draw nothing either -- which is why
//     they need no `detailLabel` and get none.
//
// So the one string this panel has to be right about is the qualifier on the
// QB passing-TD row, and it is set PER ROW for exactly that reason: a list can
// hold two kinds of row and only one of them is a line. See
// `NFL_QB_TD_DETAIL_LABEL` for why the component's default is wrong here.
//
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

export function buildPicksPanel({ sport, props, out, game }: PicksPanelInput): PicksPanel {
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

  // Touchdowns, and the heading depends on WHICH sport's number this is: see the
  // two constants above. Both backends' `predict_props` emit `anytime_td_prob`
  // for every position, so the list is cross-position and ranked on the
  // probability itself.
  const tdCategory = sport === "cfb" ? CFB_TD_CATEGORY : NFL_TD_CATEGORY;
  const tdRows = ranked
    .filter((p) => typeof p.anytime_td_prob === "number" && Number.isFinite(p.anytime_td_prob))
    // Kevin's rule, as a filter rather than a hope. NFL's `anytime_td_prob`
    // cannot contain a passing TD (the label is rushing + receiving), so a
    // quarterback here is a quarterback whose own legs or hands earn him -- and
    // this drops the ones whose number is at the base rate, which is the half
    // of the rule a rename alone would not enforce. NFL only: CFB's label still
    // sums passing TDs, so gating CFB's quarterbacks on a rush-or-receive floor
    // would filter rows on a definition that repo has not adopted.
    .filter((p) => sport === "cfb" || p.position !== "QB" || p.anytime_td_prob >= QB_RUSH_OR_RECEIVE_TD_MIN)
    .sort((a, b) => b.anytime_td_prob - a.anytime_td_prob)
    .slice(0, MAX_ROWS)
    .map<PickRow>((p) => ({
      key: `td-${p.player_id}`,
      name: p.player_name,
      team: p.recent_team,
      detail: tdCategory,
      value: p.anytime_td_prob,
      kind: "probability",
    }));
  if (tdRows.length > 0) categories.push({ category: tdCategory, rows: tdRows });

  // The QB passing-TD call, as its own heading beside the TD one rather than a
  // line inside it.
  //
  // NFL ONLY, twice over, and both are load-bearing:
  //
  //  1. CFB's `/props` carries no `passing_td_*` field at all -- its
  //     `models/player_props.py` has no `passing_tds` model -- so on today's
  //     payload the field check below is already enough. It is stated anyway,
  //     because "the payload happens not to have the field" is a fact about
  //     today and the gate is a fact about this panel: CFB must not grow the
  //     category even if a future CFB_Predictor starts emitting one.
  //  2. The row needs a CALL to print ("Over 2.5"), and a call needs a line and a
  //     side. A row carrying only `passing_td_prob` would render a bare
  //     percentage under a heading that promises a pick, so a row without a
  //     finite line and a side this panel can name is dropped rather than
  //     half-drawn.
  //
  // `passing_td_prob` is the CALLED SIDE's probability: NFL's
  // `models/qb_passing_td.py::passing_td_call` sets `call_prob =
  // max(over_prob, under_prob)` and `side` to whichever is higher, in one place
  // from one call, so ranking on `passing_td_prob` ranks on the number the row
  // displays.
  //
  // The line itself is NEVER called a sportsbook line and never an edge. It is
  // `model_line(mu)` -- the nearest half point to the model's own projection --
  // so it is derived from the same number the percentage beside it came from,
  // and the row says only which side the model is on.
  //
  // `detailLabel` is set here and nowhere else because these are the only rows
  // a reader ever sees a `detail` on, and the two gates that keep it that way
  // are DIFFERENT ones -- worth being exact about, because
  // `detailAddsToHeading` is not one of them for the yardage rows: it answers
  // `true` for `detailAddsToHeading("Pass yds", "QB passing yards")`, since the
  // tokens share nothing. The yardage rows are stopped by `rowShowsDetail`'s
  // `kind` gate before the token test is reached at all; the TD rows by the
  // token test. So a change that widened either gate would leak a qualifier onto
  // a row that states no call.
  if (sport === "nfl") {
    const qbTdRows = ranked
      .filter((p) => p.position === "QB")
      .map((p) => ({ p, prob: p.passing_td_prob, side: p.passing_td_side, line: p.passing_td_line }))
      .filter(
        (x): x is { p: PlayerPropPrediction; prob: number; side: "over" | "under"; line: number } =>
          typeof x.prob === "number" &&
          Number.isFinite(x.prob) &&
          (x.side === "over" || x.side === "under") &&
          typeof x.line === "number" &&
          Number.isFinite(x.line),
      )
      .sort((a, b) => b.prob - a.prob)
      .slice(0, MAX_ROWS)
      .map<PickRow>(({ p, prob, side, line }) => ({
        key: `qb-passing-td-${p.player_id}`,
        name: p.player_name,
        team: p.recent_team,
        detail: `${side === "over" ? "Over" : "Under"} ${line}`,
        detailLabel: NFL_QB_TD_DETAIL_LABEL,
        value: prob,
        kind: "probability",
      }));
    if (qbTdRows.length > 0) categories.push({ category: NFL_QB_PASSING_TD_CATEGORY, rows: qbTdRows });
  }

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
      .map<PickRow>(({ p, value }) => ({
        key: `${spec.market}-${p.player_id}`,
        name: p.player_name,
        team: p.recent_team,
        detail: spec.detail,
        value,
        kind: "projection",
      }));
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
