// The track record page: everything the tracker records, every number with its n.
//
// WHAT THIS PAGE IS NOT ALLOWED TO DO (each is a PRODUCT.md or a plan
// constraint, and each has been true of this file at some point):
//
//  1. Fuse volume into an accuracy. The bar width used to be
//     `(n_games / max_games) * pct_moneyline_correct * 100`, which draws a
//     1-game perfect week at a quarter of a 4-game 50% week -- a claim about
//     a game nobody can make from one game. `n_games` is text beside the bar.
//  2. Print a missing value. pydantic 2.13.5 serialises NaN to null, so this
//     payload hands over null for a float, and the tracker uses null for "not
//     measured" where 0.0 would be a legible claim. Every number goes through
//     lib/trackFormat, which prints an em-dash and never "NaN", never "0".
//  3. Claim a return. "Edge" here is the model's probability minus the
//     probability a closing line implies, in percentage points. It is not
//     money, and the page prints the backend's own `not_a_profit_claim`
//     verbatim rather than trusting a future session to remember it.
//  4. Carry meaning in colour or a sign alone. Every direction is also a
//     word: "over-forecast on average", "level with the line".
//  5. Enumerate the payload, never a list of the keys it used to have. This
//     file had a hand-written five-entry array of `vs_market.method` keys and
//     the backend added a sixth -- `population` -- which the page then dropped
//     without a word, while the test named "prints every method sentence from
//     the payload, verbatim" iterated the FIXTURE's own object and so could
//     only ever fail on a key the page already knew. The name claimed the
//     opposite of what the test could do. A block whose keys grow is rendered
//     by `Object.entries`; a label map chooses the wording and nothing else.
//
// The shapes are in ../types.ts, which is transcribed from the tracker rather
// than from the design spec, and the two do not fully agree. Read that comment
// before changing a field name.
//
// The sticky section nav is in track-record.css, and its declarations are
// asserted by reading that file -- jsdom cannot measure geometry, so the
// numbers in the B6 report came out of a real browser, not out of a test.

import { useEffect, useState, type ReactNode } from "react";
import type {
  GamesTrackRecord,
  PointForecast,
  TrackRecord,
  VsMarket,
  VsMarketScope,
  WeeklyRow,
  YardageTrackRecord,
} from "../types";
import { useSport } from "../context/SportContext";
import { StatTable, StatTile, type Column } from "../predictor-ui";
import {
  NO_VALUE,
  biasWord,
  brier,
  edgeWord,
  gradedCount,
  missing,
  plural,
  points,
  rate,
  signedPoints,
} from "../lib/trackFormat";
import "./track-record.css";

// --- the markets, in the order a reader meets them -------------------------

const YARDAGE_MARKETS = [
  { key: "passing_yards", label: "Passing yards", unit: " yd" },
  { key: "rushing_yards", label: "Rushing yards", unit: " yd" },
  { key: "receiving_yards", label: "Receiving yards", unit: " yd" },
  { key: "receptions", label: "Receptions", unit: "" },
  { key: "carries", label: "Carries", unit: "" },
] as const;

const GRADED_MARKETS = [
  { key: "moneyline", label: "Moneyline", pct: "pct_moneyline_correct", n: "n_moneyline" },
  { key: "ats", label: "Spread (ATS)", pct: "pct_ats_correct", n: "n_ats" },
  { key: "totals", label: "Total (O/U)", pct: "pct_totals_correct", n: "n_totals" },
] as const;

/** Yardage and count units. A reception is not a yard, and "±3.2 yd" for
 *  catches is a unit bug that renders as a plausible number. */
function unitFor(key: string): string {
  return YARDAGE_MARKETS.find((m) => m.key === key)?.unit ?? "";
}

// --- presentational pieces --------------------------------------------------

/**
 * One accuracy, on an accuracy scale, with the 50% reference marked.
 *
 * The fill is the accuracy and ONLY the accuracy. There is no volume share in
 * this function, and the next session must not put one back: multiplying one in
 * is what made a 1-game perfect week look like a bad one. A test greps this
 * file's CODE for `max_games` and for a division of `n_games` (comments are
 * stripped first, so the reason the formula is wrong can live in a comment).
 *
 * The bar is aria-hidden because the figure beside it is real text. Two copies
 * of the same number is worse for a screen reader than one.
 */
function AccuracyBar({ value, testId = "accuracy-bar" }: { value: number | null | undefined; testId?: string }) {
  const width = missing(value) ? 0 : Math.min(100, Math.max(0, value * 100));
  return (
    <span className="tr-bar" data-testid={testId} aria-hidden="true">
      <span className="tr-bar-fill" style={{ width: `${width}%` }} />
      <span className="tr-bar-marker" data-testid="accuracy-50-marker" />
    </span>
  );
}

function AccuracyCard({
  label,
  accuracy,
  graded,
  testId,
}: {
  label: string;
  accuracy: number | null | undefined;
  graded: string;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-pr border border-pr-rule bg-pr-panel p-4" data-testid="accuracy-card">
      <span className="text-xs font-semibold uppercase tracking-wide text-pr-text-dim">{label}</span>
      <span className="font-pr-display text-2xl font-semibold text-pr-text">{rate(accuracy)}</span>
      <AccuracyBar value={accuracy} testId={testId} />
      {/* The denominator, always. A rate with no count beside it is the B1
          mistake one level up, and this is the level at which it was made. */}
      <span className="text-xs text-pr-text-faint">{graded}</span>
    </div>
  );
}

/** A rate and its count, in one cell: "67% (12)", or a bare dash. */
function RateCell({ value, n }: { value: number | null | undefined; n: number | undefined }) {
  if (missing(value)) return <>{NO_VALUE}</>;
  return (
    <span className="tr-num" data-testid="rate">
      {rate(value)} <span className="text-pr-text-faint">({n ?? NO_VALUE})</span>
    </span>
  );
}

function Section({
  id,
  title,
  blurb,
  children,
}: {
  id: string;
  title: string;
  blurb?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-heading`} className="tr-section flex flex-col gap-3">
      <div>
        <h3 id={`${id}-heading`} className="font-pr-display text-sm font-semibold uppercase tracking-wider text-pr-text-dim">
          {title}
        </h3>
        {blurb && <p className="mt-1 max-w-3xl text-xs leading-relaxed text-pr-text-dim">{blurb}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * The count behind a headline accuracy.
 *
 * `n_resolved` is the moneyline denominator and ONLY the moneyline one: ATS
 * is graded on the subset with a spread line and both cover probabilities,
 * and totals on the subset with a total line and both over/under
 * probabilities. Printing `n_resolved` beside an ATS accuracy is a rate with
 * the wrong denominator, which is the mistake this page already shipped once
 * (B1, where `n` was read off the wrong key and a section never rendered).
 * A backend that reports no count gets a sentence that says so.
 */
function headlineCount(games: GamesTrackRecord, market: (typeof GRADED_MARKETS)[number]): string {
  const reported = games[market.n];
  if (reported != null) return gradedCount(reported);
  // Moneyline is the exception: both backends grade it on every resolved row,
  // so the resolved count IS its denominator and saying so beats a dash.
  if (market.key === "moneyline") return gradedCount(games.n_resolved);
  return "grade count not reported";
}

// --- sections ---------------------------------------------------------------

function HeadlineSection({ games }: { games: GamesTrackRecord }) {
  const rebuilt = games.n_rebuilt ?? 0;
  return (
    <Section
      id="tr-headline"
      title="Record"
      blurb="How good the model has been, in aggregate. Every rate below counts only picks made before the game started, and every rate carries the number of games behind it."
    >
      {/* Stated out loud, always, in the body text and not as a footnote: a
          reader who sees "67%" and does not see this line does not know that
          some picks exist elsewhere on the site and are not in that 67%. */}
      <p data-testid="rebuilt-note" className="max-w-3xl rounded-pr border border-pr-rule bg-pr-panel px-3 py-2 text-sm text-pr-text-dim">
        {rebuilt === 0
          ? "Every pick in this record was made before its game started."
          : `${plural(rebuilt, "pick")} rebuilt after kickoff ${
              rebuilt === 1 ? "is" : "are"
            } shown on ${rebuilt === 1 ? "its" : "their"} ${rebuilt === 1 ? "game" : "games"} but not counted here.`}
      </p>

      {games.n_resolved === 0 ? (
        <p className="text-sm text-pr-text-faint">No resolved games yet — check back once this week's games are final.</p>
      ) : (
        // Two across from the narrowest width, not one. Four cards in a single
        // 390px column pushed the section 985px down the page, which put the
        // numbers below the fold — measured in a browser, and the reason this
        // is `grid-cols-2` and not `grid-cols-1 sm:grid-cols-2`.
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {GRADED_MARKETS.map((market) => (
            <AccuracyCard
              key={market.key}
              label={`${market.label} accuracy`}
              accuracy={games[market.pct]}
              graded={headlineCount(games, market)}
              testId={`accuracy-bar-${market.key}`}
            />
          ))}
          <StatTile
            label="Games resolved"
            value={games.n_resolved.toLocaleString("en-US")}
            sub="graded, before kickoff"
          />
        </div>
      )}
    </Section>
  );
}

function WeekSection({ games }: { games: GamesTrackRecord }) {
  const weekly = games.weekly ?? [];
  const columns: Column<WeeklyRow>[] = [
    { key: "week", label: "Week", value: (r) => r.week },
    { key: "games", label: "Games", numeric: true, value: (r) => r.n_games },
    {
      key: "moneyline",
      label: "Moneyline",
      firstDir: "desc",
      value: (r) => r.pct_moneyline_correct,
      render: (r) =>
        r.tracked ? (
          <span className="flex items-center gap-2">
            <span className="inline-block w-24 shrink-0">
              <AccuracyBar value={r.pct_moneyline_correct} testId="week-bar" />
            </span>
            <RateCell value={r.pct_moneyline_correct} n={r.n_moneyline} />
          </span>
        ) : (
          // A week with nothing in it says so. It does not render a 0% bar:
          // "measured and missed everything" and "never picked" are different
          // facts and the bar would assert the first one.
          <span data-testid="not-tracked">Not tracked</span>
        ),
    },
    {
      key: "ats",
      label: "ATS",
      firstDir: "desc",
      value: (r) => r.pct_ats_correct,
      render: (r) => <RateCell value={r.pct_ats_correct} n={r.n_ats} />,
    },
    {
      key: "totals",
      label: "O/U",
      firstDir: "desc",
      value: (r) => r.pct_totals_correct,
      render: (r) => <RateCell value={r.pct_totals_correct} n={r.n_totals} />,
    },
  ];

  return (
    <Section
      id="tr-week"
      title="By week"
      blurb="Every elapsed week of the season, including the ones with nothing in them. Each market carries its own count, because a week can grade five games for the moneyline, three for the spread and two for the total."
    >
      {weekly.length === 0 ? (
        <NotRecorded why="No week-by-week record in this response." />
      ) : (
        <>
          <StatTable rows={weekly} columns={columns} rowKey={(r) => String(r.week)} caption="Accuracy by week, per market" />
          <p className="max-w-3xl text-xs leading-relaxed text-pr-text-dim">
            The bar is the moneyline accuracy on its own scale, with the 50% line marked. The game count is a
            separate number: a week with fewer games is not a worse week, it is a thinner one.
          </p>
        </>
      )}
    </Section>
  );
}

function PropsSection({ player_props }: { player_props: TrackRecord["player_props"] }) {
  const td = player_props.anytime_td;
  const buckets = td.confidence_buckets ?? [];
  const called = td.n_called;
  const anyProps = [td, ...YARDAGE_MARKETS.map((m) => player_props[m.key])].some((m) => m && m.n_resolved > 0);

  return (
    <Section
      id="tr-props"
      title="Player props"
      blurb="Anytime-touchdown calls, how well the model scores its own confidence, and how each band of that confidence actually landed."
    >
      {!anyProps ? (
        <p className="text-sm text-pr-text-faint">No resolved player props yet — check back once this week's games are final.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <AccuracyCard
              label="Anytime-TD hit rate"
              accuracy={td.hit_rate_when_called}
              graded={called == null ? "call count not reported" : `${plural(called, "call")} of ${plural(td.n_resolved, "prop")} at 50% or better`}
              testId="accuracy-bar-anytime-td"
            />
            <StatTile
              label="Anytime-TD Brier score"
              value={brier(td.brier_score)}
              sub={
                <>
                  over {plural(td.n_resolved, "prop")} · lower is better · 0.25 is a coin flip
                </>
              }
            />
            <StatTile
              label="Props resolved"
              value={td.n_resolved.toLocaleString("en-US")}
              sub={called == null ? "call count not reported" : `${plural(called, "call")} at 50% or better`}
            />
          </div>

          {buckets.length > 0 && (
            <StatTable
              rows={buckets.map((b, i) => ({ ...b, key: `${b.label}-${i}` }))}
              rowKey={(b) => b.key}
              caption="Anytime-TD hit rate by predicted-probability band"
              columns={[
                { key: "label", label: "Predicted", value: (b) => b.label },
                { key: "n", label: "Props", numeric: true, value: (b) => b.n },
                {
                  key: "hit_rate",
                  label: "Hit rate",
                  numeric: true,
                  firstDir: "desc",
                  value: (b) => b.hit_rate,
                  render: (b) =>
                    b.n > 0 ? (
                      <RateCell value={b.hit_rate} n={b.n} />
                    ) : (
                      // Every band is listed, empty ones included. A band with
                      // nothing in it is a fact about the model's confidence
                      // distribution, and dropping it would make the reader
                      // guess whether the band exists.
                      <span className="text-pr-text-faint">no calls</span>
                    ),
                },
              ]}
            />
          )}
        </>
      )}
    </Section>
  );
}

type YardageRow = { market: string; label: string; unit: string; n: number; mae: number | null; signed: number | null };

function yardageRows(player_props: TrackRecord["player_props"]): YardageRow[] {
  return YARDAGE_MARKETS.map(({ key, label, unit }) => {
    const market: YardageTrackRecord | undefined = player_props[key];
    return {
      market: key,
      label,
      unit,
      n: market?.n_resolved ?? 0,
      mae: market?.mean_absolute_error ?? null,
      signed: market?.mean_signed_error ?? null,
    };
  });
}

function YardageSection({ player_props }: { player_props: TrackRecord["player_props"] }) {
  const rows = yardageRows(player_props);
  if (!rows.some((r) => r.n > 0)) {
    return (
      <Section id="tr-yards" title="Yardage markets" blurb="How far off the projected yardage and count was.">
        <p className="text-sm text-pr-text-faint">No resolved yardage props yet — check back once this week's games are final.</p>
      </Section>
    );
  }
  return (
    <Section
      id="tr-yards"
      title="Yardage markets"
      blurb="Average error and which way it leans. Signed error is the average of predicted minus actual: positive over-forecast, negative under."
    >
      <StatTable
        rows={rows}
        rowKey={(r) => r.market}
        caption="Error by player-prop market"
        columns={[
          { key: "label", label: "Market", value: (r) => r.label },
          { key: "n", label: "Props", numeric: true, value: (r) => r.n },
          {
            key: "mae",
            label: "Avg. error",
            numeric: true,
            firstDir: "asc",
            value: (r) => r.mae,
            // The unit is part of the number, not a column header: a
            // receptions figure and a yards figure are not comparable, and one
            // shared header would have to be wrong for one of them.
            render: (r) => <span className="tr-num">{r.mae == null ? NO_VALUE : `±${points(r.mae)}${r.unit}`}</span>,
          },
          {
            key: "signed",
            label: "Signed error",
            numeric: true,
            firstDir: "asc",
            value: (r) => r.signed,
            render: (r) => <span className="tr-num">{signedPoints(r.signed)}</span>,
          },
          { key: "which", label: "Which way", value: (r) => biasWord(r.signed) },
        ]}
      />
    </Section>
  );
}

type PositionRow = { key: string; market: string; marketKey: string; position: string; n: number | null; mae: number | null };

/**
 * The per-position rows, from whichever shape the backend sent.
 *
 * NFL sends a list with the count beside every position's error. CFB sends a
 * bare map, and buckets rows with no recorded position under "unknown" where
 * NFL leaves them out of the list entirely. Both are read, and the n column
 * says which one it has -- a position's error with no count beside it is a
 * number nobody can weigh.
 */
function positionRows(player_props: TrackRecord["player_props"]): PositionRow[] {
  const rows: PositionRow[] = [];
  for (const { key, label } of YARDAGE_MARKETS) {
    const market: YardageTrackRecord | undefined = player_props[key];
    if (!market) continue;
    if (market.by_position) {
      for (const row of market.by_position) {
        rows.push({ key: `${key}:${row.position}`, market: label, marketKey: key, position: row.position, n: row.n_resolved, mae: row.mean_absolute_error });
      }
    } else if (market.mae_by_position) {
      for (const [position, mae] of Object.entries(market.mae_by_position)) {
        rows.push({ key: `${key}:${position}`, market: label, marketKey: key, position, n: null, mae });
      }
    }
  }
  return rows;
}

function PositionSection({ player_props }: { player_props: TrackRecord["player_props"] }) {
  const rows = positionRows(player_props);
  // "n props were not split out" is only a fact when every position row came
  // with a count. CFB's map carries no count beside a position, so subtracting
  // its unknown-as-zero would claim all 120 of its props carry no position --
  // which is the opposite of what that payload says.
  const countsKnown = rows.length > 0 && rows.every((r) => r.n != null);
  const hidden = countsKnown
    ? yardageRows(player_props).reduce((total, r) => total + r.n, 0) - rows.reduce((total, r) => total + (r.n ?? 0), 0)
    : null;

  return (
    <Section
      id="tr-position"
      title="By position"
      blurb="The same error, split by the position the prop belonged to. A market that only ever had one position in it is a one-row table, and that is the honest shape of it."
    >
      {rows.length === 0 ? (
        <NotRecorded why="No prop in this record carries a position." />
      ) : (
        <>
          <StatTable
            rows={rows}
            rowKey={(r) => r.key}
            caption="Average error by prop market and position"
            columns={[
              { key: "market", label: "Market", value: (r) => r.market },
              { key: "position", label: "Position", value: (r) => r.position },
              { key: "n", label: "Props", numeric: true, value: (r) => r.n },
              {
                key: "mae",
                label: "Avg. error",
                numeric: true,
                firstDir: "asc",
                value: (r) => r.mae,
                render: (r) => (
                  <span className="tr-num">
                    {r.mae == null ? NO_VALUE : `±${points(r.mae)}${unitFor(r.marketKey)}`}
                  </span>
                ),
              },
            ]}
          />
          {hidden != null && hidden > 0 && (
            <p className="max-w-3xl text-xs text-pr-text-dim">
              {plural(hidden, "prop")} in the totals above {hidden === 1 ? "carries" : "carry"} no recorded
              position and {hidden === 1 ? "is" : "are"} not split out here.
            </p>
          )}
        </>
      )}
    </Section>
  );
}

type ForecastRow = { week: number; tracked: boolean; n: number; mae: number | null; signed: number | null };

function forecastRows(forecast: PointForecast | undefined): ForecastRow[] {
  return (forecast?.weekly ?? []).map((w) => ({ week: w.week, tracked: w.tracked, n: w.n, mae: w.mae, signed: w.signed_error }));
}

const FORECASTS = [
  { key: "totals", label: "Total points", what: "the combined score" },
  { key: "margin", label: "Margin", what: "the winning margin" },
] as const;

function PointsSection({ games }: { games: GamesTrackRecord }) {
  const present = FORECASTS.filter((f) => games[f.key]);
  if (present.length === 0) {
    return (
      <Section
        id="tr-points"
        title="Points"
        blurb="What the model predicted in points, against what the game actually produced."
      >
        <NotRecorded why="No points forecast in this response." />
      </Section>
    );
  }

  return (
    <Section
      id="tr-points"
      title="Points"
      blurb="What the model predicted in points, against what the game actually produced. Picks recorded before the tracker stored a points forecast have none, and are left out of this entirely rather than counted as a forecast of zero."
    >
      {present.map((forecast) => {
        const block = games[forecast.key]!;
        return (
          <div key={forecast.key} className="flex flex-col gap-2">
            <h4 className="font-pr-display text-xs font-semibold uppercase tracking-wider text-pr-text-faint">
              {forecast.label} — {forecast.what}
            </h4>
            <StatTable
              rows={forecastRows(block)}
              rowKey={(r) => String(r.week)}
              caption={`${forecast.label} error by week`}
              columns={[
                { key: "week", label: "Week", value: (r) => r.week },
                {
                  key: "n",
                  label: "Forecast",
                  numeric: true,
                  value: (r) => r.n,
                  render: (r) => (r.n > 0 ? <span className="tr-num">{r.n}</span> : <span data-testid="not-forecast">Not forecast</span>),
                },
                {
                  key: "mae",
                  label: "Avg. error",
                  numeric: true,
                  firstDir: "asc",
                  value: (r) => r.mae,
                  render: (r) => <span className="tr-num">{r.mae == null ? NO_VALUE : `±${points(r.mae)} pt`}</span>,
                },
                {
                  key: "signed",
                  label: "Signed error",
                  numeric: true,
                  firstDir: "asc",
                  value: (r) => r.signed,
                  render: (r) => <span className="tr-num">{signedPoints(r.signed)} pt</span>,
                },
                { key: "which", label: "Which way", value: (r) => biasWord(r.signed) },
              ]}
            />
            <p className="text-xs text-pr-text-dim">
              Overall over {plural(block.n, "game")} with a forecast: average error{" "}
              {block.mae == null ? NO_VALUE : `±${points(block.mae)} pt`}, and {overallDirection(block.signed_error)}.
            </p>
          </div>
        );
      })}
    </Section>
  );
}

/**
 * The overall line's direction clause, as a clause.
 *
 * `biasWord` returns a PREDICATE -- "under-forecast on average" -- and the
 * sentence wants a noun phrase in front of it, so the verb has to be here and
 * the absence of the measurement has to be handled before the predicate is
 * asked for at all. Dropping "it" into the slot and letting `biasWord` return
 * "not measured" produced "and it not measured (— pt)" on exactly the path the
 * no-NaN constraint exists for: the reader gets a broken clause and a bare unit
 * with no number in it.
 */
function overallDirection(signed: number | null | undefined): string {
  if (missing(signed)) return "the direction is not measured";
  return `it ${biasWord(signed)} (${signedPoints(signed)} pt)`;
}

/**
 * The heading for each method key the tracker sends.
 *
 * A LABEL MAP, not a list of keys to render. A list of keys to render was the
 * bug: the backend added a sixth key and the page dropped it silently, while
 * the test that claimed to cover the block iterated the fixture's own object
 * and so could only fail on a key the page already knew. Enumerating the
 * payload is the fix; this map only chooses the WORDING of a heading.
 */
const METHOD_LABELS: Record<string, string | undefined> = {
  sigma_league_points: "League margin σ",
  sigma_league_meaning: "League margin σ, what it means",
  implied_probability: "What the line implies",
  edge: "What edge means",
  disagreement: "The disagreement cohort",
  not_a_profit_claim: "What this is not",
  population: "Who is in this number",
};

/** The one method value that is a number rather than a sentence. */
const SIGMA_KEY = "sigma_league_points";

/** An unlabelled key still gets a heading. "hits_the_line" reads as a heading;
 *  rendering nothing at all is what left a backend key reaching nobody. */
function methodLabel(key: string): string {
  return METHOD_LABELS[key] ?? key.replace(/_/g, " ");
}

/** One method value, printed. A σ is a width, so it prints as a number with a
 *  unit rather than as a sentence. */
function methodValue(key: string, value: string | number | undefined): string {
  if (value == null) return "not in this response";
  return key === SIGMA_KEY ? `${points(value as number)} points` : String(value);
}

function MethodBlock({ method }: { method: VsMarket["method"] | undefined }) {
  // ONE ROW PER KEY IN THE PAYLOAD. The count is the payload's, not this file's,
  // and the test asserts that against the fixture rather than against a list.
  const entries = Object.entries(method ?? {});
  if (entries.length === 0) {
    return <NotRecorded why="This response does not describe how the comparison is made." />;
  }
  return (
    <dl data-testid="method-block" className="flex flex-col gap-2 rounded-pr border border-pr-rule bg-pr-panel p-4">
      {entries.map(([key, value]) => (
        <div key={key} data-testid="method-row">
          <dt className="text-xs font-semibold uppercase tracking-wide text-pr-text-faint">{methodLabel(key)}</dt>
          <dd className="mt-0.5 max-w-3xl text-xs leading-relaxed text-pr-text-dim">
            {methodValue(key, value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The reconciliation the backend ships, printed between the chart and the
 * headline it does not sum to.
 *
 * The headline is the whole record and the week table is one season's elapsed
 * weeks. Without this note the page puts "Games compared: 412" directly above a
 * table that adds up to 180 and says nothing about it, so the reader has to
 * discover the gap and guess which number is wrong. The backend computed the
 * split — and computed `n_games_in_weekly` as the sum of the chart's own rows
 * rather than as a second count, which is why it cannot drift. The page prints
 * what it is sent and recomputes nothing: a second count of the same games is
 * exactly the number that stops agreeing with the thing it describes.
 */
function ScopeNote({ scope }: { scope: VsMarketScope }) {
  const { population, weekly_season, weekly_last_week, n_games_total, n_games_in_weekly, n_games_outside_weekly } = scope;
  // `weekly_season` is null when nothing in the frame names a season, and the
  // emitter then groups the window unfiltered — so the table is over every week
  // number in the record, across seasons. Saying "the current season" there
  // would be a claim the payload does not make.
  const window =
    weekly_season == null
      ? "every week number in the record, across seasons and not scoped to one"
      : `the ${weekly_season} season's elapsed weeks`;
  return (
    <p data-testid="scope-note" className="max-w-3xl text-xs leading-relaxed text-pr-text-dim">
      The figures above cover <span className="tr-num">{n_games_total.toLocaleString("en-US")}</span> games — the{" "}
      <span className="tr-num">{population}</span> population. The week table below accounts for{" "}
      <span className="tr-num">{n_games_in_weekly.toLocaleString("en-US")}</span> of them, over {window}
      {weekly_last_week == null ? "" : `, through week ${weekly_last_week}`}.{" "}
      {n_games_outside_weekly === 0
        ? "Every game in the headline is in the table."
        : `${plural(n_games_outside_weekly, "game")} in the headline ${n_games_outside_weekly === 1 ? "falls" : "fall"} outside that window, which is why the table does not add up to the count above.`}
    </p>
  );
}

function MarketSection({ vs_market }: { vs_market: VsMarket | undefined }) {
  if (!vs_market) {
    return (
      <Section
        id="tr-market"
        title="Vs the market"
        blurb="The model's probability next to the probability a closing line asserts."
      >
        <NotRecorded why="No model-versus-market comparison in this response." />
      </Section>
    );
  }
  const method = vs_market.method;

  return (
    <Section
      id="tr-market"
      title="Vs the market"
      blurb="The model's cover probability beside the one a closing spread asserts, over the games where both exist. This is agreement with a price, not a return: nothing in this section is a stake, a yield or a cent."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Games compared" value={vs_market.n.toLocaleString("en-US")} sub="with a line and a grade" />
        <StatTile
          label="Line implies, home covers"
          value={rate(vs_market.mean_implied_home_cover_prob)}
          sub={`over ${plural(vs_market.n, "game")}`}
        />
        <StatTile
          label="Model says, home covers"
          value={rate(vs_market.mean_model_home_cover_prob)}
          sub={`over ${plural(vs_market.n, "game")}`}
        />
        <StatTile
          label="Mean edge"
          value={vs_market.mean_edge_points == null ? NO_VALUE : `${signedPoints(vs_market.mean_edge_points)} pt`}
          // Every number carries its own n. The other three tiles in this row
          // say "over N games" and this one did not, so its denominator was
          // three tiles to the left at 390px and nowhere else. Wrapped in a
          // span so the words stay their own element for a screen reader.
          sub={
            <>
              <span>{edgeWord(vs_market.mean_edge_points)}</span> · over {plural(vs_market.n, "game")}
            </>
          }
        />
      </div>

      {/* The cohort is the number to read: a pick against the price, and how
          often it landed. The mean edge above is a calibration check, and the
          backend's own words say so. */}
      <div className="rounded-pr border border-pr-rule bg-pr-panel p-4">
        <h4 className="font-pr-display text-xs font-semibold uppercase tracking-wider text-pr-text-faint">
          Games where the model backed the side the line did not
        </h4>
        <p className="mt-1 font-pr-display text-2xl font-semibold text-pr-text">
          {rate(vs_market.disagreement?.hit_rate ?? vs_market.disagreement_hit_rate)}
        </p>
        <p className="text-xs text-pr-text-dim">
          Hit rate over {plural(vs_market.disagreement?.n ?? vs_market.disagreement_n, "game")} where it
          disagreed with the line. Pick&apos;em lines, evenly split model probabilities and pushes are left
          out: none of them has a side to disagree with.
        </p>
        {vs_market.disagreement?.games?.length ? (
          <p className="mt-2 text-xs text-pr-text-faint">
            Game IDs in this cohort:{" "}
            <span className="tr-num break-words text-pr-text-dim">
              {vs_market.disagreement.games.join(", ")}
            </span>
          </p>
        ) : null}
      </div>

      {vs_market.weekly?.length > 0 && (
        <>
          {vs_market.scope && <ScopeNote scope={vs_market.scope} />}
          <StatTable
            rows={vs_market.weekly}
            rowKey={(r) => String(r.week)}
            caption="Model against the closing line, by week"
            columns={[
              { key: "week", label: "Week", value: (r) => r.week },
              {
                key: "n",
                label: "Games",
                numeric: true,
                value: (r) => r.n,
                render: (r) => (r.n > 0 ? <span className="tr-num">{r.n}</span> : <span data-testid="not-compared">Not compared</span>),
              },
              { key: "implied", label: "Line implies", numeric: true, value: (r) => r.mean_implied_home_cover_prob, render: (r) => <RateCell value={r.mean_implied_home_cover_prob} n={r.n} /> },
              { key: "model", label: "Model says", numeric: true, value: (r) => r.mean_model_home_cover_prob, render: (r) => <RateCell value={r.mean_model_home_cover_prob} n={r.n} /> },
              {
                key: "edge",
                label: "Mean edge",
                numeric: true,
                firstDir: "asc",
                value: (r) => r.mean_edge_points,
                render: (r) => <span className="tr-num">{r.mean_edge_points == null ? NO_VALUE : `${signedPoints(r.mean_edge_points)} pt`}</span>,
              },
              { key: "cohort", label: "Cohort", numeric: true, value: (r) => r.disagreement_n, render: (r) => <RateCell value={r.disagreement_hit_rate} n={r.disagreement_n} /> },
            ]}
          />
        </>
      )}

      {/* Printed from the payload, verbatim, once per key it sent. A number
          nobody can interpret is not a decision aid, and a disclaimer nobody
          reads is not one either -- so the backend sends the sentences and this
          page does not get to paraphrase them away. */}
      <MethodBlock method={method} />
    </Section>
  );
}

/** A section whose data this payload does not carry, said plainly. */
function NotRecorded({ why }: { why: string }) {
  return (
    <p data-testid="not-recorded" className="rounded-pr border border-pr-rule bg-pr-panel px-3 py-2 text-sm text-pr-text-dim">
      {why}
    </p>
  );
}

export function TrackRecordPage() {
  const { api, sport } = useSport();
  const [record, setRecord] = useState<TrackRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRecord(null); setError(null);
    api.trackRecord().then(setRecord).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [api, sport]);

  if (error) return <p role="alert" className="text-sm text-loss">{error}</p>;
  if (!record) return <p className="text-sm text-sp-text-faint">Loading…</p>;

  const { games, player_props } = record;

  // The nav lists exactly the sections below, and the ids are the contract
  // between the two: an entry pointing at a missing id is a link that does
  // nothing, and a section with no entry is unreachable on a page longer
  // than a screen.
  const sections: [string, string][] = [
    ["tr-headline", "Record"],
    ["tr-week", "By week"],
    ["tr-props", "Player props"],
    ["tr-yards", "Yardage"],
    ["tr-position", "By position"],
    ["tr-points", "Points"],
    ["tr-market", "Vs market"],
  ];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="mb-1 font-display text-2xl font-semibold uppercase tracking-wide text-sp-text">Track Record</h2>
        <p className="mb-4 text-xs text-sp-text-faint">
          How good the model actually is, in aggregate — not a game-by-game log.
        </p>
      </div>

      {/* The headline is above the nav on purpose. It is what a reader came
          for, and it has to be in the first screen; the nav only pins once
          they have scrolled past it. */}
      <HeadlineSection games={games} />

      <nav className="tr-nav" aria-label="Track record sections">
        <div className="tr-nav-scroll">
          <ul className="flex h-full items-stretch gap-1 px-1">
            {sections.map(([id, label]) => (
              <li key={id} className="flex">
                <a href={`#${id}`}>{label}</a>
              </li>
            ))}
          </ul>
        </div>
      </nav>

      <WeekSection games={games} />
      <PropsSection player_props={player_props} />
      <YardageSection player_props={player_props} />
      <PositionSection player_props={player_props} />
      <PointsSection games={games} />
      <MarketSection vs_market={games.vs_market} />
    </div>
  );
}
