// B6 — the track record page.
//
// The rules this file exists to hold:
//
//  - Every rate carries the count behind it, and the count is the count of
//    THAT market's graded subset. Reading `n_resolved` beside an ATS accuracy
//    is B1's mistake one level up: a rate with the wrong denominator.
//  - Volume and accuracy never fuse. Two guards, and both were checked by
//    reverting the fix (see the two tests that name it).
//  - Nothing missing ever prints as a number, and a 0 is never printed for a
//    absent value.
//  - The method words come from the payload verbatim, so a session that
//    forgets to explain σ_league cannot ship.
//  - Every section the nav links to exists, and every section has a nav
//    entry.
//
// The fixture is the real emitted shape with small counts on purpose. A
// section guarded on the wrong field renders nothing, and a test that
// `findByText`s a value inside it times out rather than passing quietly —
// which is the whole reason the counts here are 1s and 2s and not 400s.

import { describe, expect, it, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen, within } from "@testing-library/react";
import { TrackRecordPage } from "./TrackRecordPage";
import { contrast } from "../predictor-ui";
import type { SportApi, TrackRecord } from "../types";

const PAGE = resolve(__dirname, "TrackRecordPage.tsx");
const CSS = resolve(__dirname, "track-record.css");
const TOKENS = resolve(__dirname, "../predictor-ui/tokens.css");

const source = readFileSync(PAGE, "utf8");
/** The page's code with its comments removed, for "is this expression here?" questions. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// --- fixtures ---------------------------------------------------------------

/**
 * NFL's `/track-record` AFTER #25, as `get_track_record` now emits it.
 *
 * The shapes that matter here and did not exist before that PR:
 *
 *  - `n_resolved` counts EVERY counted pick (the earliest recorded one per
 *    (game, market)), whenever it was made. It is the headline.
 *  - `pre_kickoff` is the same summariser over the subset whose own timestamps
 *    prove they were made before kickoff, with its own `n`. That is the figure
 *    BESIDE the headline, not a second copy of it.
 *  - `n_rebuilt` is retained on NFL and now means "counted picks made at or
 *    after their own kickoff" -- the reconciliation, not an exclusion.
 *  - `all_picks` is retained under its published name and its `n_resolved`
 *    EQUALS the headline's. Carried here precisely so the page can be shown not
 *    rendering it as a third figure: two sections showing one number is the
 *    "same pick as two different numbers" defect this repo is guarding against.
 *  - `per_pick` rows carry `made_before_kickoff` beside their own
 *    `snapshotted_at`, so the page never has to work out when a pick was made.
 */
const NFL_RECORD: TrackRecord = {
  games: {
    n_resolved: 6,
    n_rebuilt: 2,
    n_moneyline: 6,
    n_ats: 4,
    n_totals: 3,
    pct_moneyline_correct: 0.667,
    pct_ats_correct: 0.5,
    pct_totals_correct: 0.333,
    // The secondary figure. 4 of the 6 counted picks were made before their own
    // kickoff; ATS and totals are graded on smaller subsets of those four, so
    // this block is NOT the headline with the same denominators.
    pre_kickoff: {
      n_resolved: 4,
      n_moneyline: 4,
      n_ats: 3,
      n_totals: 2,
      pct_moneyline_correct: 0.5,
      pct_ats_correct: 0.667,
      pct_totals_correct: 0.5,
    },
    // Same population as the headline now, by construction. Present so the test
    // can assert the page does not print it as a figure of its own.
    all_picks: {
      n_resolved: 6,
      pct_moneyline_correct: 0.667,
      pct_ats_correct: 0.5,
      pct_totals_correct: 0.333,
    },
    per_pick: [
      { game_id: "401547", gameday: "2026-09-06T17:00:00Z", market: "moneyline", pick: "KC", actual: "KC", hit: true, made_before_kickoff: true, snapshotted_at: "2026-09-06T14:00:00Z", rebuilt: false },
      { game_id: "401548", gameday: "2026-09-13T17:00:00Z", market: "moneyline", pick: "BAL", actual: "NE", hit: false, made_before_kickoff: true, snapshotted_at: "2026-09-13T14:00:00Z", rebuilt: false },
      { game_id: "401549", gameday: "2026-09-20T17:00:00Z", market: "moneyline", pick: "DET", actual: "DET", hit: true, made_before_kickoff: false, snapshotted_at: "2026-09-20T19:30:00Z", rebuilt: true },
    ],
    weekly: [
      // B2's own arithmetic, and the two counts DELIBERATELY different. The
      // "Games" column's only job is to keep volume apart from the moneyline
      // denominator, and with `n_games === n_moneyline` in every week there
      // was no data that could tell a page printing one for the other. Week 1
      // is four games of which three had a moneyline to grade: 2 of 3.
      { week: 1, tracked: true, n_games: 4, n_moneyline: 3, pct_moneyline_correct: 0.667, n_ats: 2, pct_ats_correct: 1.0, n_totals: 1, pct_totals_correct: 0.0 },
      { week: 2, tracked: true, n_games: 1, n_moneyline: 1, pct_moneyline_correct: 1.0, n_ats: 1, pct_ats_correct: 0.0, n_totals: 1, pct_totals_correct: 0.0 },
      { week: 3, tracked: false, n_games: 0, n_moneyline: 0, pct_moneyline_correct: null, n_ats: 0, pct_ats_correct: null, n_totals: 0, pct_totals_correct: null },
    ],
    totals: {
      n: 2,
      mae: 6.7,
      signed_error: -2.7,
      weekly: [
        { week: 1, tracked: true, n: 1, mae: 10.0, signed_error: 4.0 },
        { week: 2, tracked: true, n: 1, mae: 3.4, signed_error: -9.4 },
        { week: 3, tracked: false, n: 0, mae: null, signed_error: null },
      ],
    },
    margin: {
      n: 2,
      mae: 4.2,
      signed_error: 1.2,
      weekly: [
        { week: 1, tracked: true, n: 2, mae: 4.2, signed_error: 1.2 },
        { week: 2, tracked: false, n: 0, mae: null, signed_error: null },
        { week: 3, tracked: false, n: 0, mae: null, signed_error: null },
      ],
    },
    vs_market: {
      n: 4,
      mean_implied_home_cover_prob: 0.5146,
      mean_model_home_cover_prob: 0.475,
      mean_edge_points: -3.96,
      disagreement_n: 1,
      disagreement_hit_rate: 0.5,
      disagreement: { n: 1, hit_rate: 0.5, games: ["401547"] },
      weekly: [
        { week: 1, tracked: true, n: 3, mean_implied_home_cover_prob: 0.5194, mean_model_home_cover_prob: 0.4667, mean_edge_points: -5.28, disagreement_n: 1, disagreement_hit_rate: 0.5, games: ["401547"] },
        { week: 2, tracked: true, n: 1, mean_implied_home_cover_prob: 0.5, mean_model_home_cover_prob: 0.5, mean_edge_points: 0.0, disagreement_n: 0, disagreement_hit_rate: null, games: [] },
        { week: 3, tracked: false, n: 0, mean_implied_home_cover_prob: null, mean_model_home_cover_prob: null, mean_edge_points: null, disagreement_n: 0, disagreement_hit_rate: null, games: [] },
      ],
      // `_vs_market_scope`. The headline is the whole record; the chart above
      // is three weeks of it. 2 of the 4 compared games are not in any weekly
      // row, which is the gap the note has to state.
      scope: {
        population: "all_seasons",
        weekly_season: 2025,
        weekly_last_week: 3,
        n_games_total: 4,
        n_games_in_weekly: 3,
        n_games_outside_weekly: 1,
      },
      method: {
        sigma_league_points: 13.5,
        sigma_league_meaning: "NFL final margin is treated as roughly Normal with a standard deviation of 13.5 points.",
        implied_probability: "The closing line is a margin, so the probability the market is asserting is Φ(spread / 13.5).",
        edge: "Edge is the model's cover probability minus the probability the closing line implies, in percentage points.",
        disagreement: "The disagreement cohort is the games where the model backed the side the line did not favour.",
        not_a_profit_claim: "This is agreement with a price, not a profit claim. No figure here is a return, a yield, a stake or a cent.",
        // The sixth key. Added to `_VS_MARKET_METHOD` after this page was
        // written, and the reason the block is now rendered generically.
        population: "The headline figure covers every game the tracker holds a line for, in every season. The chart below covers one season's elapsed weeks only, so the two are over different populations on purpose.",
      },
    },
  },
  player_props: {
    anytime_td: {
      n_resolved: 4,
      n_called: 3,
      hit_rate_when_called: 0.667,
      brier_score: 0.18,
      confidence_buckets: [
        { label: "50-60%", n: 1, hit_rate: 0.0 },
        { label: "60-70%", n: 0, hit_rate: null },
        { label: "70%+", n: 2, hit_rate: 1.0 },
      ],
    },
    passing_yards: {
      n_resolved: 2,
      mean_absolute_error: 39.5,
      mean_signed_error: -20.5,
      by_position: [
        { position: "QB", n_resolved: 2, mean_absolute_error: 39.5 },
        { position: "WR", n_resolved: 1, mean_absolute_error: 51.0 },
      ],
    },
    rushing_yards: {
      n_resolved: 2,
      mean_absolute_error: 18.0,
      mean_signed_error: -3.0,
      by_position: [{ position: "RB", n_resolved: 2, mean_absolute_error: 18.0 }],
    },
    receiving_yards: {
      n_resolved: 1,
      mean_absolute_error: 13.0,
      mean_signed_error: 2.0,
      by_position: [],
    },
    // Never resolved, and never rendered as a zero.
    receptions: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null, by_position: [] },
    carries: { n_resolved: 1, mean_absolute_error: 3.0, mean_signed_error: -3.0, by_position: [] },
  },
};

/**
 * CFB's `/track-record` AFTER #27, which has still not had B2-B5: still
 * `weekly_trend`, no per-market counts, no points forecasts, no `vs_market`, and
 * a `mae_by_position` map with no count beside it.
 *
 * DUMPED, NOT TYPED. This is the output of CFB_Predictor's own
 * `_summarize_games` / `_summarize_player_props`, run over frames with its real
 * column names — 12 resolved games (7 moneyline hits, 4 ATS-graded, none
 * totals-graded) and 150 resolved props. The previous version of this fixture
 * was hand-written, and it was wrong in a way that hid a behaviour: it set
 * `confidence_buckets: []` where `_td_confidence_buckets` ALWAYS returns three
 * bands, so the test drew its conclusion from a payload CFB cannot send. Same
 * lesson as the `method` block, one layer down: a hand-written stand-in for a
 * payload is a payload that disagrees with the emitter, and nothing notices
 * until the emitter moves.
 *
 * It also carries the `weekly_trend` the real payload has and the old fixture
 * omitted, so the page can be shown NOT reading it.
 *
 * (The shipped `data/tracking.db` on this machine has zero resolved rows, so
 * the live response is the degenerate all-null one. The shape is what matters
 * here, and the shape of a populated response is what this is.)
 *
 * This fixture is the reason the new keys in types.ts are optional. One site
 * serves both sports off `?sport=`, so a CFB payload that throws is not a
 * cosmetic problem — it is the same crash B6 was commissioned to end, on the
 * other half of the site.
 */
const CFB_RECORD = {
  games: {
    n_resolved: 12,
    pct_moneyline_correct: 0.5833333333333334,
    pct_ats_correct: 0.5,
    pct_totals_correct: null,
    // #27 REMOVED `n_rebuilt` on CFB rather than renaming it into a lie, and
    // ADDED the two figures the swap needs: the headline (this block) over every
    // counted pick, `pre_kickoff` over the subset made before kickoff, and
    // `n_pre_kickoff` for that subset's n at the top. So a CFB payload has no
    // `n_rebuilt` at all, which is why the page's timing note cannot depend on
    // it existing.
    n_pre_kickoff: 9,
    pre_kickoff: {
      n_resolved: 9,
      pct_moneyline_correct: 0.4444444444444444,
      pct_ats_correct: 0.25,
      pct_totals_correct: null,
      weekly_trend: [
        { week: 1, pct_moneyline_correct: 1.0, n_games: 3 },
        { week: 2, pct_moneyline_correct: 0.5, n_games: 3 },
        { week: 3, pct_moneyline_correct: 0.0, n_games: 3 },
      ],
    },
    // CFB lists every RECORDED pick here, counted or not, and says which is
    // counted on the row (`counted`). So a CFB per-pick table is longer than
    // the headline's population, and the page has to render that flag rather
    // than imply every row scored.
    per_pick: [
      { game_id: "cfb1", gameday: "2026-09-05T19:00:00Z", market: "moneyline", pick: "ALA", actual: "ALA", hit: true, made_before_kickoff: true, snapshotted_at: "2026-09-05T15:00:00Z", counted: true },
      { game_id: "cfb2", gameday: "2026-09-12T19:00:00Z", market: "moneyline", pick: "FSU", actual: "FSU", hit: true, made_before_kickoff: true, snapshotted_at: "2026-09-12T15:00:00Z", counted: true },
      { game_id: "cfb3", gameday: "2026-09-19T19:00:00Z", market: "moneyline", pick: "UGA", actual: "AUB", hit: false, made_before_kickoff: true, snapshotted_at: "2026-09-19T15:00:00Z", counted: true },
      // A rerun, kept as history: recorded, not the counted pick, and made after
      // its own kickoff. Two facts the page must not collapse into one.
      { game_id: "cfb3", gameday: "2026-09-19T19:00:00Z", market: "moneyline", pick: "AUB", actual: "AUB", hit: true, made_before_kickoff: false, snapshotted_at: "2026-09-19T21:40:00Z", counted: false },
    ],
    weekly_trend: [
      { week: 1, pct_moneyline_correct: 1.0, n_games: 5 },
      { week: 2, pct_moneyline_correct: 0.5, n_games: 4 },
      { week: 3, pct_moneyline_correct: 0.0, n_games: 3 },
    ],
  },
  player_props: {
    anytime_td: {
      n_resolved: 30,
      n_called: 20,
      hit_rate_when_called: 0.55,
      brier_score: 0.21794000000000002,
      // Three bands, always -- the emitter enumerates them, it does not filter.
      confidence_buckets: [
        { label: "50-60%", n: 4, hit_rate: 0.5 },
        { label: "60-70%", n: 6, hit_rate: 0.5 },
        { label: "70%+", n: 10, hit_rate: 0.6 },
      ],
    },
    passing_yards: { n_resolved: 40, mean_absolute_error: 25.5, mean_signed_error: 4.25, mae_by_position: { QB: 29.0, WR: 15.0 } },
    rushing_yards: { n_resolved: 40, mean_absolute_error: 15.0, mean_signed_error: -7.0, mae_by_position: { RB: 15.0 } },
    receiving_yards: { n_resolved: 40, mean_absolute_error: 18.0, mean_signed_error: 5.65, mae_by_position: { WR: 18.0 } },
    // Never resolved, and never rendered as a zero -- as emitted.
    receptions: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null, mae_by_position: {} },
    carries: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null, mae_by_position: {} },
  },
} as unknown as TrackRecord;

const trackRecord = vi.fn(async (): Promise<TrackRecord> => NFL_RECORD);
const api = {
  trackRecord,
  games: vi.fn(), gamePrediction: vi.fn(), playerProps: vi.fn(),
  retrain: vi.fn(), gameVerdict: vi.fn(), predictionsForWeek: vi.fn(),
  currentWeek: vi.fn(), standings: vi.fn(), powerRankings: vi.fn(),
  predictionsBatch: vi.fn(), teamForm: vi.fn(), headToHead: vi.fn(),
} as unknown as SportApi;

vi.mock("../context/SportContext", () => ({
  useSport: () => ({ sport: "nfl", setSport: () => {}, api }),
}));

beforeEach(() => {
  trackRecord.mockReset();
  trackRecord.mockResolvedValue(NFL_RECORD);
});

/** The fill widths of every bar, in document order. */
function barWidths(container: HTMLElement, testId: string): string[] {
  return [...container.querySelectorAll(`[data-testid="${testId}"] .tr-bar-fill`)].map(
    (el) => (el as HTMLElement).style.width,
  );
}

/**
 * Every element wearing a STATUS colour -- win, loss, lean -- whatever the
 * property. Read off the rendered tree rather than off the source, because a
 * token ban in the source is the guard that let `text-loss` through: the regex
 * named `pr-loss` and the page writes `loss`, because `index.css` aliases
 * `--color-loss: var(--color-pr-loss)`. Both spellings, both the `pr-` form
 * and the bare one, and `text-` / `bg-` / `border-` / `stroke-` prefixes.
 */
const STATUS_COLOUR = /(?:^|\s)(?:text|bg|border|stroke|fill|from|to|via)-(?:pr-)?(?:win|loss|lean)\b/;
function statusColoured(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>("*")].filter((el) =>
    STATUS_COLOUR.test(el.getAttribute("class") ?? ""),
  );
}

/**
 * `getByText` on an element's WHOLE text, for text split across child nodes —
 * "50% (4)" is a rate, a space and a count in two elements, and the default
 * matcher only reads an element's direct text nodes. Restricted to leaf-ish
 * elements so the wrapper does not match the same text a second time.
 */
const wholeText = (s: string) => (_content: string, el: Element | null) =>
  el?.textContent?.trim() === s && el.querySelectorAll("[data-testid='rate'], .tr-bar").length === 0;

/**
 * One body row of a `StatTable`, by position in the payload. The table renders
 * unsorted until a header is clicked, so row order is data order -- which is
 * why this is an index and not a "find the row whose week is 1", since a week
 * number appears in several columns.
 */
function rowAt(table: HTMLElement, index: number): HTMLElement {
  const rows = table.querySelectorAll<HTMLElement>("tbody tr");
  expect(rows.length, "the table has no rows at all").toBeGreaterThan(index);
  return rows[index];
}

/**
 * One cell of a body row, by column position. Cell-indexed rather than
 * text-matched because a row carries the same digits in several columns, and an
 * assertion like `getByText("4")` passes for the wrong reason often enough to
 * be worth the extra two lines.
 */
function cellAt(row: HTMLElement, index: number): HTMLElement {
  const cells = row.querySelectorAll<HTMLElement>("td");
  expect(cells.length, "the row has no cells at all").toBeGreaterThan(index);
  return cells[index];
}

/** The body row of a table whose first two cells read exactly this. */
function rowWith(table: HTMLElement, ...wanted: string[]): HTMLElement {
  const found = [...table.querySelectorAll<HTMLElement>("tbody tr")].find((r) =>
    wanted.every((text, i) => cellAt(r, i).textContent?.trim() === text),
  );
  expect(found, `no row starting ${wanted.join(" / ")}`).toBeTruthy();
  return found!;
}

async function renderPage() {
  const result = render(<TrackRecordPage />);
  // Waits on a value INSIDE the headline section, and on its own bar rather
  // than the label: since the reversal there are two accuracy cards labelled
  // "Moneyline accuracy" -- the headline and the pre-kickoff subset -- so
  // waiting on the label would resolve on whichever rendered first and would
  // stop being a check that the headline rendered at all. A section that stops
  // rendering fails here by timing out rather than by passing quietly.
  await screen.findByTestId("accuracy-bar-moneyline");
  return result;
}

/** One of the HEADLINE's accuracy cards, never the pre-kickoff subset's. */
function headlineCard(label: string): HTMLElement {
  return within(document.getElementById("tr-headline")!).getByText(label).parentElement!;
}

// --- 1. the headline --------------------------------------------------------

describe("headline", () => {
  it("gives each market the count of ITS OWN graded games, not the row count", async () => {
    await renderPage();
    // 6 resolved, 4 ATS grades, 3 total grades. Three different denominators,
    // and the ATS card must not say 6.
    const [ml, ats, totals] = ["Moneyline accuracy", "Spread (ATS) accuracy", "Total (O/U) accuracy"].map(
      headlineCard,
    );
    expect(within(ml).getByText("6 games graded")).toBeInTheDocument();
    expect(within(ats).getByText("4 games graded")).toBeInTheDocument();
    expect(within(totals).getByText("3 games graded")).toBeInTheDocument();
    expect(within(ats).queryByText("6 games graded")).not.toBeInTheDocument();
    expect(within(totals).queryByText("6 games graded")).not.toBeInTheDocument();
  });

  // The swap (predictor-hub #66, decided 2026-10-01). The headline is EVERY
  // counted pick, whenever it was made; the figure beside it is the pre-kickoff
  // subset with its own n. Honesty moved from exclusion to disclosure, so the
  // note under the headline now states WHEN the late picks were made and never
  // claims they are held out of the record.
  it("counts every counted pick in the headline, and says when the late ones were made", async () => {
    await renderPage();
    // 6 counted picks, of which 2 were made at or after their own kickoff. The
    // headline's n is 6 -- the FULL population, which is what `n_resolved`
    // reports now -- and the note discloses the 2 without excluding them.
    const note = screen.getByTestId("rebuilt-note");
    expect(note).toHaveTextContent("6");
    expect(note).toHaveTextContent("2");
    expect(note).toHaveTextContent(/made after kickoff/i);
    expect(note.textContent).not.toMatch(/not counted/i);
    // A footnote is a smaller, dimmer thing than this; assert the size class.
    expect(note.className).toContain("text-sm");
    expect(note.className).not.toContain("text-xs");
  });

  it("never claims a post-kickoff pick is held out of the record, on any payload", async () => {
    // Read off the RENDERED page, not off this file's copy: the claim is what a
    // reader would see, and a sentence that moved into a helper is still
    // rendered. Both payloads, because CFB has no `n_rebuilt` at all after #27
    // and the note must not depend on that key existing.
    await renderPage();
    expect(document.body.textContent).not.toMatch(/not\s+counted/i);
    expect(document.body.textContent).not.toMatch(/for\s+reference/i);
    trackRecord.mockResolvedValue(CFB_RECORD);
    await renderPage();
    expect(document.body.textContent).not.toMatch(/not\s+counted/i);
  });

  it("prints the headline's n beside the headline, never the pre-kickoff subset's", async () => {
    await renderPage();
    // The single most dangerous half of this swap: a page that kept the old
    // headline and only added a secondary would show 4 here (the pre-kickoff
    // subset) where the API now reports 6 (every counted pick).
    const tile = screen.getByText("Games resolved").parentElement!;
    expect(within(tile).getByText("6")).toBeInTheDocument();
    expect(within(tile).queryByText("4")).not.toBeInTheDocument();
    expect(within(tile).getByText(/counted|every/i)).toBeInTheDocument();
  });

  it("shows the pre-kickoff subset beside it, with its own n", async () => {
    await renderPage();
    const section = document.getElementById("tr-pre-kickoff")!;
    // Its own n, its own denominator: 4 games, 3 ATS grades, 2 total grades.
    expect(within(section).getByText("4 games graded")).toBeInTheDocument();
    expect(within(section).getByText("3 games graded")).toBeInTheDocument();
    expect(within(section).getByText("2 games graded")).toBeInTheDocument();
    // Its own accuracies, so the two figures cannot be the same number wearing
    // two labels: the headline's moneyline is 67%, the subset's is 50%.
    const subsetMoneyline = within(section)
      .getByText("Moneyline accuracy")
      .parentElement!;
    expect(within(subsetMoneyline).getByText("50%")).toBeInTheDocument();
    expect(within(headlineCard("Moneyline accuracy")).getByText("67%")).toBeInTheDocument();
    // The subset's own n, as a tile, rather than a second reading of the
    // headline's.
    expect(within(section).getByText("Picks made before kickoff")).toBeInTheDocument();
    expect(within(section).getByText("4")).toBeInTheDocument();
  });

  it("does not print all_picks as a figure of its own, because it IS the headline now", async () => {
    // NFL retained `all_picks` under its published name and its `n_resolved`
    // now EQUALS the headline's. Rendering it beside the headline would put one
    // number on the page twice -- which is the "same pick as two different
    // numbers" defect, and worse, invites the two copies drifting apart.
    await renderPage();
    // The identity is in the FIXTURE, so it is provable even though the page
    // never reads the block.
    expect(NFL_RECORD.games.all_picks!.n_resolved).toBe(NFL_RECORD.games.n_resolved);
    // ...and no section on the page is titled for it any more.
    expect(document.body.textContent).not.toMatch(/all tracked picks/i);
  });

  it("discloses the timing of every pick row from the row's own field", async () => {
    await renderPage();
    const table = screen.getByRole("table", { name: /per-pick detail/i });
    const rows = [...table.querySelectorAll<HTMLElement>("tbody tr")];
    expect(rows).toHaveLength(3);
    // Two made in time, one made after its own kickoff -- read off
    // `made_before_kickoff` on the row, which is the field both backends send.
    // A page that inferred this from `snapshotted_at` vs `gameday` would be
    // re-deriving on the frontend what the backend derived from the same two
    // columns, and the spec forbids exactly that.
    expect(within(rows[0]).getByText(/made before kickoff/i)).toBeInTheDocument();
    expect(within(rows[1]).getByText(/made before kickoff/i)).toBeInTheDocument();
    expect(within(rows[2]).getByText(/made after kickoff/i)).toBeInTheDocument();
    expect(within(rows[2]).queryByText(/made before kickoff/i)).toBeNull();
    // Each row carries the moment it was made, so the claim above is checkable.
    expect(within(rows[2]).getByText(/Sep 20, 2026/)).toBeInTheDocument();
  });

  it("marks a recorded-but-uncounted row as history, on CFB's longer list", async () => {
    // CFB's `per_pick` lists every recorded row, `counted` or not. So a page
    // that assumes every listed row scored would let a reader tally four rows
    // and "arrive" at a headline of twelve. The flag is on the row.
    trackRecord.mockResolvedValue(CFB_RECORD);
    await renderPage();
    const table = screen.getByRole("table", { name: /per-pick detail/i });
    const rows = [...table.querySelectorAll<HTMLElement>("tbody tr")];
    expect(rows).toHaveLength(4);
    expect(within(rows[0]).getByText(/counted/i)).toBeInTheDocument();
    expect(within(rows[3]).getByText(/made after kickoff/i)).toBeInTheDocument();
    expect(within(rows[3]).getByText(/history|not the counted pick/i)).toBeInTheDocument();
    // ...and the two claims on that row are separate facts, both stated.
    expect(within(rows[3]).getByText(/miss|hit/i)).toBeInTheDocument();
  });

  it("never labels a post-kickoff row as a pre-game prediction", async () => {
    await renderPage();
    // The words that would make the claim. A reader must never come away
    // thinking a number computed after the whistle was live at tip-off.
    const body = document.body.textContent ?? "";
    expect(body).not.toMatch(/(made|recorded|snapshotted)\s+before[^.]*but[^.]*(after|later)/i);
    expect(body).not.toMatch(/before the game started[^.]*(excluded|held out|refused)/i);
  });

  it("marks the 50% break-even point on every accuracy card", async () => {
    const { container } = await renderPage();
    const cards = container.querySelectorAll("[data-testid='accuracy-card']");
    // moneyline, ATS, totals, anytime-TD — one marker inside each of those
    // cards, and not one marker floating somewhere on the page.
    expect(cards.length).toBe(4);
    for (const card of cards) {
      expect(card.querySelectorAll("[data-testid='accuracy-50-marker']")).toHaveLength(1);
    }
    // The bar carries the UNROUNDED rate and the figure beside it is rounded:
    // 0.667 draws at 66.7% of the track and reads "67%". Rounding the width to
    // match the text would be tidier and would be a second, lossy copy of the
    // same number.
    expect(barWidths(container, "accuracy-bar-moneyline")).toEqual(["66.7%"]);
    expect(within(headlineCard("Moneyline accuracy")).getByText("67%")).toBeInTheDocument();
  });
});

// --- 2. by week -------------------------------------------------------------

describe("by week", () => {
  it("lists every elapsed week, marked when there was nothing to track", async () => {
    await renderPage();
    const table = screen.getByRole("table", { name: /accuracy by week/i });
    expect(table.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(within(rowAt(table, 2)).getByTestId("not-tracked")).toHaveTextContent("Not tracked");
  });

  it("gives an untracked week a dash, not a zero, on every market", async () => {
    await renderPage();
    const table = screen.getByRole("table", { name: /accuracy by week/i });
    const row = rowAt(table, 2);
    expect(within(row).getByTestId("not-tracked")).toBeInTheDocument();
    expect(within(row).getAllByText("—")).toHaveLength(2);
    expect(within(row).queryByText(/0%/)).not.toBeInTheDocument();
  });

  it("shows the game count beside the rate as its own number", async () => {
    await renderPage();
    const table = screen.getByRole("table", { name: /accuracy by week/i });
    expect(within(rowAt(table, 0)).getByText(wholeText("67% (3)"))).toBeInTheDocument();
    expect(within(rowAt(table, 1)).getByText(wholeText("100% (1)"))).toBeInTheDocument();
  });

  it("keeps the Games column a VOLUME figure, not the moneyline's denominator", async () => {
    await renderPage();
    const table = screen.getByRole("table", { name: /accuracy by week/i });
    // Week 1 is 4 games, of which 3 had a moneyline. A page that printed the
    // graded count in the volume column would show 3 here, and the test fails
    // on the cell rather than on a coincidence elsewhere in the row.
    expect(cellAt(rowAt(table, 0), 1)).toHaveTextContent("4");
    expect(cellAt(rowAt(table, 0), 1)).not.toHaveTextContent("3");
  });

  // The bar fix. Reverting this makes the width 25% instead of 100%.
  it("draws a week bar on the accuracy scale alone, and the game count as text", async () => {
    const { container } = await renderPage();
    expect(barWidths(container, "week-bar")).toEqual(["66.7%", "100%"]);
    // The one-game perfect week is the whole point: a volume share multiplied
    // back in would draw it at 25%, a quarter of the track.
    const table = screen.getByRole("table", { name: /accuracy by week/i });
    expect(within(rowAt(table, 1)).getByText(wholeText("100% (1)"))).toBeInTheDocument();
  });

  it("never multiplies a volume share into an accuracy anywhere in the page", () => {
    // Checked against the code, not the prose: the reason the formula is wrong
    // belongs in a comment and must not itself trip the guard.
    expect(code).not.toMatch(/max_games/);
    expect(code).not.toMatch(/n_games\s*\/[^\n]*\*/);
    expect(code).toMatch(/n_games/);
  });
});

// --- 3. player props --------------------------------------------------------

describe("player props", () => {
  it("states the anytime-TD hit rate over the calls, and how many props that was", async () => {
    await renderPage();
    const card = screen.getByText("Anytime-TD hit rate").parentElement!;
    expect(within(card).getByText("67%")).toBeInTheDocument();
    expect(within(card).getByText("3 calls of 4 props at 50% or better")).toBeInTheDocument();
  });

  it("prints the Brier score to three places, with its own count", async () => {
    await renderPage();
    const tile = screen.getByText("Anytime-TD Brier score").parentElement!;
    expect(within(tile).getByText("0.180")).toBeInTheDocument();
    expect(within(tile).getByText(/over 4 props/)).toBeInTheDocument();
  });

  it("lists every confidence band, including the empty one", async () => {
    await renderPage();
    const table = screen.getByRole("table", { name: /anytime-td hit rate by predicted-probability band/i });
    expect(table.querySelectorAll("tbody tr")).toHaveLength(3);
    for (const label of ["50-60%", "60-70%", "70%+"]) {
      expect(within(table).getByText(label)).toBeInTheDocument();
    }
    // The empty band says "no calls" and rates 0% for nobody. A band with
    // nothing in it is a fact about the model's confidence distribution, and
    // dropping it would make the reader guess whether the band exists.
    const empty = rowAt(table, 1);
    expect(within(empty).getByText("no calls")).toBeInTheDocument();
    expect(within(empty).queryByText("0%")).not.toBeInTheDocument();
    expect(within(rowAt(table, 2)).getByText(wholeText("100% (2)"))).toBeInTheDocument();
  });

  it("lists CFB's three bands too, because the emitter always sends three", async () => {
    // The hand-written CFB fixture used to say `confidence_buckets: []`, and
    // `_td_confidence_buckets` has never once returned an empty list -- it
    // enumerates the bands. The page reading a real payload is what this is
    // for, so the fixture is dumped now and this asserts the consequence.
    trackRecord.mockResolvedValue(CFB_RECORD);
    await renderPage();
    const table = screen.getByRole("table", { name: /anytime-td hit rate by predicted-probability band/i });
    expect(table.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(within(rowAt(table, 0)).getByText(wholeText("50% (4)"))).toBeInTheDocument();
    expect(within(rowAt(table, 2)).getByText(wholeText("60% (10)"))).toBeInTheDocument();
    // And the empty-band state is NOT reached from a real payload, because a
    // band CFB sends always has its own row, hit rate or not.
    expect(within(table).queryByText("no calls")).not.toBeInTheDocument();
  });

  it("says the call count was not reported when the emitter sent no `n_called`", async () => {
    // `_summarize_player_props` omits `n_called` exactly when the anytime-TD
    // market resolved nothing. That is NOT the same as the section being
    // empty -- `anyProps` is true when a YARDAGE market has props -- so the
    // branch is reachable, and reachable from a payload the backend really
    // emits. A payload that drops the key must not read as zero calls.
    trackRecord.mockResolvedValue({
      ...NFL_RECORD,
      player_props: {
        ...NFL_RECORD.player_props,
        anytime_td: { n_resolved: 0, hit_rate_when_called: null, brier_score: null, confidence_buckets: [] },
      },
    });
    await renderPage();
    // The section still renders, because the yardage markets do have props.
    expect(screen.getByText("Anytime-TD hit rate")).toBeInTheDocument();
    expect(screen.getAllByText("call count not reported")).toHaveLength(2);
    expect(screen.queryByText(/0 calls of/)).not.toBeInTheDocument();
  });

  // The two below are the B1 calibration render tests, carried in from
  // origin/v2-wire and kept rather than dropped. They are PORTED, not
  // transcribed: that side wrote them against the pre-B6 page, so they named
  // that page's strings -- the heading "Anytime-TD hit rate by confidence" and a
  // `weekly_trend` key this contract no longer declares. The B6 rewrite
  // renders the same calibration section as a `StatTable` captioned "Anytime-TD
  // hit rate by predicted-probability band", so the assertions below name that
  // table instead. Both keep their original subject: the section appears when
  // the buckets have calls, and it does not appear when they do not. The
  // fixture is theirs' -- one band with a call and two without -- because a
  // payload in which two of three bands are empty is the one that can tell the
  // two states apart.
  it("renders the Anytime-TD calibration section when confidence buckets have calls", async () => {
    trackRecord.mockResolvedValue({
      ...NFL_RECORD,
      player_props: {
        ...NFL_RECORD.player_props,
        anytime_td: {
          n_resolved: 30, hit_rate_when_called: 0.6, brier_score: 0.18, n_called: 20,
          confidence_buckets: [
            { label: "50-60%", n: 1, hit_rate: 1.0 },
            { label: "60-70%", n: 0, hit_rate: null },
            { label: "70%+", n: 0, hit_rate: null },
          ],
        },
      },
    });
    await renderPage();
    const table = screen.getByRole("table", { name: /anytime-td hit rate by predicted-probability band/i });
    expect(within(table).getByText("50-60%")).toBeInTheDocument();
    // The band that carries the call states its rate, and the two empty bands
    // say so rather than rating 0% for nobody.
    expect(within(rowAt(table, 0)).getByText(wholeText("100% (1)"))).toBeInTheDocument();
    expect(within(rowAt(table, 1)).getByText("no calls")).toBeInTheDocument();
    expect(within(rowAt(table, 2)).getByText("no calls")).toBeInTheDocument();
  });

  it("does not render the Anytime-TD calibration section when confidence buckets are empty", async () => {
    // `weekly_trend` is gone from this side's fixture on purpose: B3 removed the
    // key from the API and `types.ts` no longer declares it, so a fixture that
    // carried it would put the removed shape back into the type layer. The CFB
    // fixture above still carries it -- dumped rather than typed -- precisely so
    // the page can be shown NOT reading it.
    trackRecord.mockResolvedValue({
      games: { n_resolved: 0, n_rebuilt: 0, pct_moneyline_correct: null, pct_ats_correct: null, pct_totals_correct: null },
      player_props: {
        anytime_td: { n_resolved: 0, hit_rate_when_called: null, brier_score: null, n_called: 0, confidence_buckets: [] },
        passing_yards: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null },
        rushing_yards: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null },
        receiving_yards: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null },
      },
    });
    render(<TrackRecordPage />);
    expect(await screen.findByText("No resolved player props yet — check back once this week's games are final.")).toBeInTheDocument();
    // The subject of the test, stated outright: no calibration table, because
    // there is nothing to calibrate against.
    expect(screen.queryByRole("table", { name: /anytime-td hit rate by predicted-probability band/i })).not.toBeInTheDocument();
  });
});

// --- 4. the yardage markets -------------------------------------------------

describe("yardage markets", () => {
  it("gives each market its error, its direction and its own count", async () => {
    await renderPage();
    const table = screen.getByRole("table", { name: /error by player-prop market/i });
    const row = within(table).getByText("Passing yards").closest("tr")!;
    expect(within(row).getByText("±39.5 yd")).toBeInTheDocument();
    expect(within(row).getByText("−20.5")).toBeInTheDocument();
    // The direction is a word, not a sign and a colour.
    expect(within(row).getByText("under-forecast on average")).toBeInTheDocument();
    expect(within(row).getByText("2")).toBeInTheDocument();
  });

  it("keeps a count market's unit off a yardage figure", async () => {
    await renderPage();
    const table = screen.getByRole("table", { name: /error by player-prop market/i });
    const carries = within(table).getByText("Carries").closest("tr")!;
    expect(within(carries).getByText("±3.0")).toBeInTheDocument();
    expect(within(carries).queryByText(/yd/)).not.toBeInTheDocument();
  });

  it("shows an ungraded market as a dash and not a zero", async () => {
    await renderPage();
    const table = screen.getByRole("table", { name: /error by player-prop market/i });
    const receptions = within(table).getByText("Receptions").closest("tr")!;
    expect(within(receptions).getAllByText("—")).toHaveLength(2);
    expect(within(receptions).queryByText("±0.0")).not.toBeInTheDocument();
    expect(within(receptions).getByText("0")).toBeInTheDocument();
  });
});

// --- 5. by position ---------------------------------------------------------

describe("by position", () => {
  it("splits NFL's by_position list, with the count beside every position", async () => {
    await renderPage();
    const table = screen.getByRole("table", { name: /average error by prop market and position/i });
    const qb = within(table).getByText("QB").closest("tr")!;
    expect(within(qb).getByText("Passing yards")).toBeInTheDocument();
    expect(within(qb).getByText("±39.5 yd")).toBeInTheDocument();
    expect(within(qb).getByText("2")).toBeInTheDocument();
    // A second position in the same market, so a table that only ever showed
    // the first row of each market would still fail here.
    const wr = within(table).getByText("WR").closest("tr")!;
    expect(within(wr).getByText("±51.0 yd")).toBeInTheDocument();
    expect(within(wr).getByText("1")).toBeInTheDocument();
  });

  it("reads CFB's bare mae_by_position map as well, and says its count is missing", async () => {
    trackRecord.mockResolvedValue(CFB_RECORD);
    await renderPage();
    const table = screen.getByRole("table", { name: /average error by prop market and position/i });
    // The real CFB map has a second key in it, so a reader of one entry per
    // market -- the shape the hand-written fixture had -- fails here. Found by
    // market AND position, because two of CFB's rows are WR.
    const qb = rowWith(table, "Passing yards", "QB");
    expect(within(qb).getByText("±29.0 yd")).toBeInTheDocument();
    const receiving = rowWith(table, "Receiving yards", "WR");
    expect(within(receiving).getByText("±18.0 yd")).toBeInTheDocument();
    // CFB's map carries no count, so the cell says so instead of guessing one.
    expect(within(qb).getByText("—")).toBeInTheDocument();
    // And the page does NOT claim those 120 props carry no position, which is
    // what subtracting an unknown-as-zero would have said. It cannot know how
    // many it left out, so it says nothing about it.
    expect(screen.queryByText(/in the totals above carry no recorded position/)).not.toBeInTheDocument();
  });

  it("says how many positioned props the split leaves out, when it can know", async () => {
    await renderPage();
    // 6 resolved props across the yardage markets; 5 carry a position.
    expect(screen.getByText(/1 prop in the totals above carries no recorded position/)).toBeInTheDocument();
  });
});

// --- 6. the points forecasts ------------------------------------------------

describe("points", () => {
  it("reports total points and margin separately, each with its own count", async () => {
    await renderPage();
    expect(screen.getByText("Total points — the combined score")).toBeInTheDocument();
    expect(screen.getByText("Margin — the winning margin")).toBeInTheDocument();
    const table = screen.getByRole("table", { name: /total points error by week/i });
    const week1 = rowAt(table, 0);
    expect(within(week1).getByText("±10.0 pt")).toBeInTheDocument();
    expect(within(week1).getByText("+4.0 pt")).toBeInTheDocument();
    expect(within(week1).getByText("over-forecast on average")).toBeInTheDocument();
  });

  it("marks a week with no points forecast as not forecast, not as zero error", async () => {
    await renderPage();
    const table = screen.getByRole("table", { name: /margin error by week/i });
    expect(within(table).getAllByTestId("not-forecast")).toHaveLength(2);
    expect(within(table).queryByText("±0.0 pt")).not.toBeInTheDocument();
  });

  it("says the overall figure and the direction in words", async () => {
    await renderPage();
    expect(
      screen.getByText(/Overall over 2 games with a forecast: average error ±6.7 pt, and it under-forecast on average/),
    ).toBeInTheDocument();
  });

  it("keeps the overall line a sentence when the signed error was never measured", async () => {
    // The path the no-NaN constraint exists for, and the one the populated
    // fixture never reaches: `biasWord` hands back a PREDICATE, so a null
    // signed error used to render "and it not measured (— pt)" -- a broken
    // clause and a bare unit with no number in it.
    trackRecord.mockResolvedValue({
      ...NFL_RECORD,
      games: {
        ...NFL_RECORD.games,
        totals: {
          n: 0,
          mae: null,
          signed_error: null,
          weekly: [{ week: 1, tracked: false, n: 0, mae: null, signed_error: null }],
        },
      },
    });
    await renderPage();
    expect(
      screen.getByText(/Overall over 0 games with a forecast: average error —, and the direction is not measured\./),
    ).toBeInTheDocument();
    // The predicate is never dropped into a slot that wants a noun phrase.
    expect(screen.queryByText(/and it not measured/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/— pt\)/);
  });
});

// --- 7. vs the market -------------------------------------------------------

describe("vs the market", () => {
  it("prints the model's probability, the line's, and the gap in points", async () => {
    await renderPage();
    expect(within(screen.getByText("Line implies, home covers").parentElement!).getByText("51%")).toBeInTheDocument();
    expect(within(screen.getByText("Model says, home covers").parentElement!).getByText("48%")).toBeInTheDocument();
    // "Mean edge" is a tile label and a column header; the tile is the first.
    const edge = screen.getAllByText("Mean edge")[0].parentElement!;
    expect(within(edge).getByText("−4.0 pt")).toBeInTheDocument();
    expect(within(edge).getByText("the model's probability sits below the line's")).toBeInTheDocument();
  });

  it("gives the mean edge its own n, not a reference to a tile three across", async () => {
    await renderPage();
    // Every number on this page carries the count behind it. This tile's
    // denominator is the "Games compared" tile, which at 390px is three tiles
    // to the left -- so the count is repeated here in words.
    const edge = screen.getAllByText("Mean edge")[0].parentElement!;
    expect(edge).toHaveTextContent("over 4 games");
    const compared = screen.getByText("Games compared").parentElement!;
    expect(compared).toHaveTextContent("4");
  });

  it("leads with the disagreement cohort, over the games in it", async () => {
    await renderPage();
    expect(screen.getByText(/Hit rate over 1 game where it disagreed with the line/)).toBeInTheDocument();
    expect(screen.getByText(/Game IDs in this cohort/)).toHaveTextContent("401547");
  });

  it("prints every method sentence from the payload, verbatim", async () => {
    await renderPage();
    const method = NFL_RECORD.games.vs_market!.method;
    const entries = Object.entries(method);

    // ONE ROW PER KEY, and the count is the PAYLOAD's. This is the assertion
    // with teeth in the direction that matters: a page that renders a
    // hand-written list of the keys it knows passes while the tracker sends a
    // key it does not, which is not hypothetical — `population` is the sixth
    // key and the five-entry array this replaced dropped it without a word.
    // The old version of this test iterated the fixture's own object, so it
    // could only fail on a key the page already knew.
    expect(screen.getAllByTestId("method-row")).toHaveLength(entries.length);

    // σ is the one value that is a number rather than a sentence: it prints as
    // a width with a unit, and it prints AT ALL.
    const sentences = entries.filter(([key]) => key !== "sigma_league_points");
    expect(sentences).toHaveLength(entries.length - 1);
    for (const [, sentence] of sentences) {
      expect(screen.getByText(sentence as string)).toBeInTheDocument();
    }
    expect(screen.getByText(`${method.sigma_league_points} points`)).toBeInTheDocument();
  });

  it("renders a method key it has no label for, rather than dropping it", async () => {
    // The failure mode of the hard-coded list, reached directly. A key this
    // file has never heard of gets a heading derived from its own name and its
    // sentence verbatim, and the row count moves with the payload.
    trackRecord.mockResolvedValue({
      ...NFL_RECORD,
      games: {
        ...NFL_RECORD.games,
        vs_market: {
          ...NFL_RECORD.games.vs_market!,
          method: {
            ...NFL_RECORD.games.vs_market!.method,
            calibration_drift: "Mean error of the implied probability against what happened.",
          },
        },
      },
    });
    await renderPage();
    const method = NFL_RECORD.games.vs_market!.method;
    expect(screen.getAllByTestId("method-row")).toHaveLength(Object.keys(method).length + 1);
    expect(screen.getByText("calibration drift")).toBeInTheDocument();
    expect(screen.getByText("Mean error of the implied probability against what happened.")).toBeInTheDocument();
  });

  it("says which games the headline covers and which the week table does", async () => {
    await renderPage();
    const scope = NFL_RECORD.games.vs_market!.scope!;
    const note = screen.getByTestId("scope-note");
    expect(note).toHaveTextContent(`${scope.n_games_total} games`);
    expect(note).toHaveTextContent(scope.population);
    expect(note).toHaveTextContent(`accounts for ${scope.n_games_in_weekly} of them`);
    expect(note).toHaveTextContent("the 2025 season's elapsed weeks, through week 3");
    expect(note).toHaveTextContent("1 game in the headline falls outside that window");
    // The audit identity the block exists to be auditable by, on the fixture
    // the page is rendering: the note is not a second opinion, it is the sum.
    expect(scope.n_games_total).toBe(scope.n_games_in_weekly + scope.n_games_outside_weekly);
    // The count the note reconciles is the count on the tile, not a new number.
    const tile = screen.getByText("Games compared").parentElement!;
    expect(within(tile).getByText(String(scope.n_games_total))).toBeInTheDocument();
  });

  it("renders the comparison when the response carries no scope block at all", async () => {
    // A backend older than the scope block. The note goes; the section does
    // not, because a missing optional block must never be a thrown page.
    const vs_market = { ...NFL_RECORD.games.vs_market! };
    delete vs_market.scope;
    trackRecord.mockResolvedValue({ ...NFL_RECORD, games: { ...NFL_RECORD.games, vs_market } });
    await renderPage();
    expect(screen.queryByTestId("scope-note")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("method-row")).toHaveLength(
      Object.keys(NFL_RECORD.games.vs_market!.method).length,
    );
  });

  it("carries the no-profit statement from the payload, not from a string in this file", async () => {
    await renderPage();
    expect(screen.getByText(NFL_RECORD.games.vs_market!.method.not_a_profit_claim)).toBeInTheDocument();
    // So the page itself cannot grow a profit claim in a later session.
    expect(source).not.toMatch(/ROI|return on|\bprofit\b|\bbeats the book/i);
  });

  it("breaks the comparison down by week, with a not-compared state", async () => {
    await renderPage();
    const table = screen.getByRole("table", { name: /model against the closing line, by week/i });
    expect(within(table).getByTestId("not-compared")).toBeInTheDocument();
  });
});

// --- 8. never a number that isn't a measurement -----------------------------

describe("absent values", () => {
  it("prints an em-dash and never NaN for a null in the payload", async () => {
    trackRecord.mockResolvedValue({
      games: {
        n_resolved: 1,
        n_rebuilt: 0,
        n_moneyline: 1,
        n_ats: 0,
        n_totals: 0,
        pct_moneyline_correct: null,
        pct_ats_correct: null,
        pct_totals_correct: null,
        weekly: [{ week: 1, tracked: true, n_games: 1, n_moneyline: 1, pct_moneyline_correct: null, n_ats: 0, pct_ats_correct: null, n_totals: 0, pct_totals_correct: null }],
        totals: { n: 0, mae: null, signed_error: null, weekly: [{ week: 1, tracked: false, n: 0, mae: null, signed_error: null }] },
        vs_market: { n: 0, mean_implied_home_cover_prob: null, mean_model_home_cover_prob: null, mean_edge_points: null, disagreement_n: 0, disagreement_hit_rate: null, disagreement: { n: 0, hit_rate: null, games: [] }, weekly: [], method: NFL_RECORD.games.vs_market!.method },
      },
      player_props: {
        anytime_td: { n_resolved: 0, hit_rate_when_called: null, brier_score: null, confidence_buckets: [{ label: "50-60%", n: 0, hit_rate: null }] },
        passing_yards: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null },
        rushing_yards: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null },
        receiving_yards: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null },
      },
    } as unknown as TrackRecord);

    const { container } = render(<TrackRecordPage />);
    await screen.findByTestId("accuracy-bar-moneyline");
    // pydantic hands over null, JSON.parse can hand over NaN through a
    // non-JSON path, and a divide-by-zero can produce one in the page. None of
    // them may reach the screen as text.
    expect(container.textContent).not.toMatch(/NaN/);
    expect(container.textContent).not.toMatch(/undefined/);
    expect(container.textContent).not.toMatch(/Infinity/);
  });
});

// --- 9. a payload the page cannot be complete against -----------------------

describe("a backend that has not shipped the newer blocks", () => {
  it("renders the CFB payload without throwing, and says what is not recorded", async () => {
    trackRecord.mockResolvedValue(CFB_RECORD);
    await renderPage();
    // The headline still works: moneyline's denominator IS the resolved count.
    expect(within(headlineCard("Moneyline accuracy")).getByText("12 games graded")).toBeInTheDocument();
    // The ATS card has no count to print and says so rather than borrowing
    // the moneyline's.
    expect(within(headlineCard("Spread (ATS) accuracy")).getByText("grade count not reported")).toBeInTheDocument();
    // And the pre-kickoff subset reads off CFB's own `n_pre_kickoff` block:
    // #27 REMOVED `n_rebuilt` on CFB, so a note built on that key alone would
    // have nothing to say on half the site.
    const preTile = within(document.getElementById("tr-pre-kickoff")!)
      .getByText("Picks made before kickoff")
      .parentElement!;
    expect(within(preTile).getByText("9")).toBeInTheDocument();
    expect(screen.getByTestId("rebuilt-note")).toHaveTextContent("3");
    // And each absent block says so, instead of rendering nothing at all.
    // EXACTLY three: the week list, the points forecasts and the whole
    // vs-market block. The position table is NOT one of them -- CFB sends a
    // `mae_by_position` map, so there are four rows to render.
    expect(screen.getAllByTestId("not-recorded")).toHaveLength(3);
    expect(screen.getByText("No week-by-week record in this response.")).toBeInTheDocument();
    expect(screen.getByText("No points forecast in this response.")).toBeInTheDocument();
    expect(screen.getByText("No model-versus-market comparison in this response.")).toBeInTheDocument();
    // CFB's payload DOES carry `weekly_trend`, three rows of it, and the page
    // still says the record is not in this response. The old key is not read as
    // the new one, which is only provable because the fixture now has it.
    expect((CFB_RECORD.games as unknown as { weekly_trend: unknown[] }).weekly_trend).toHaveLength(3);
    expect(screen.queryByRole("table", { name: /accuracy by week/i })).not.toBeInTheDocument();
    // The copy is about the RESPONSE and not about the backend: a missing key
    // is all this page can see, and a page defect that read the wrong key would
    // otherwise print a false claim about what CFB can do.
    expect(screen.queryByText(/This backend does not/)).not.toBeInTheDocument();
  });
});

// --- 10. the section nav ----------------------------------------------------

describe("the section nav", () => {
  it("links to a section that exists, and every section has an entry", async () => {
    await renderPage();
    const nav = screen.getByRole("navigation", { name: /track record sections/i });
    const hrefs = [...nav.querySelectorAll("a")].map((a) => a.getAttribute("href")!);
    // `#tr-pre-kickoff` is where `#tr-all-picks` was, and the per-pick detail is
    // its OWN top-level section now rather than a nested one with no nav entry.
    // A nested section with no entry is a section nobody can jump to.
    expect(hrefs).toEqual([
      "#tr-headline", "#tr-pre-kickoff", "#tr-picks", "#tr-week", "#tr-props", "#tr-yards", "#tr-position", "#tr-points", "#tr-market",
    ]);
    for (const href of hrefs) {
      const id = href.slice(1);
      const section = document.getElementById(id);
      expect(section, `${href} points at nothing`).toBeInTheDocument();
      expect(section!.getAttribute("class")).toContain("tr-section");
    }
    // No section on the page without a nav entry: a section nobody can jump to
    // is unreachable on a page taller than a screen.
    const rendered = [...document.querySelectorAll("section.tr-section")].map((s) => `#${s.id}`);
    expect(rendered.sort()).toEqual([...hrefs].sort());
  });

  it("puts the headline above the nav, so it is what is above the fold", async () => {
    await renderPage();
    // DOM order is the thing under test; the visual consequence (no overlap,
    // headline within the first screen) is measured in a browser and reported,
    // because jsdom's getBoundingClientRect is all zeros.
    const sections = [...document.querySelectorAll("section.tr-section")].map((s) => s.id);
    expect(sections[0]).toBe("tr-headline");
    const headline = document.getElementById("tr-headline")!;
    const nav = screen.getByRole("navigation", { name: /track record sections/i });
    // follows() is true when the nav comes after the headline in document order.
    expect(headline.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // The layout contract jsdom cannot measure. These are the declarations the
  // report's browser numbers rest on; a rename or a deletion fails here.
  it("is sticky, opaque, and sized so an anchor jump clears it", async () => {
    await renderPage();
    const css = readFileSync(CSS, "utf8");
    const nav = /\.tr-nav\s*\{([^}]*)\}/.exec(css)![1];
    expect(nav).toMatch(/position:\s*sticky/);
    expect(nav).toMatch(/top:\s*0/);
    // Opaque, or the rows scrolling underneath read through it.
    expect(nav).toMatch(/background:\s*var\(--color-pr-stage\)/);
    // A fixed height, because `scroll-margin-top` below is a number that has
    // to be able to clear this box.
    expect(nav).toMatch(/height:\s*3rem/);

    const scroll = /\.tr-nav-scroll\s*\{([^}]*)\}/.exec(css)![1];
    // The links scroll in their own box: the DOCUMENT never scrolls sideways.
    expect(scroll).toMatch(/overflow-x:\s*auto/);
    expect(scroll).toMatch(/min-width:\s*0/);

    // 4rem = the nav's 3rem plus a 1rem gap. If one moves, the other must.
    const section = /\.tr-section\s*\{([^}]*)\}/.exec(css)![1];
    expect(section).toMatch(/scroll-margin-top:\s*4rem/);

    // 12px is the floor, and it is written into the nav's own rules rather
    // than inherited from a class that might change.
    const link = /\.tr-nav a\s*\{([^}]*)\}/.exec(css)![1];
    expect(link).toMatch(/font-size:\s*12px/);

    // ...and the page still APPLIES those classes. Every assertion above reads
    // a stylesheet, which is a promise about a file; this is the promise about
    // the page, and without it a `className="tr-nav"` rename to a Tailwind
    // utility would leave the whole block green while the page lost every
    // one of these guarantees at once.
    const navEl = screen.getByRole("navigation", { name: /track record sections/i });
    expect(navEl.className).toContain("tr-nav");
    expect(navEl.firstElementChild!.className).toContain("tr-nav-scroll");
    expect(document.getElementById("tr-headline")!.className).toContain("tr-section");
  });

  it("says the rail scrolls, without a gradient and without moving the anchor offset", async () => {
    const css = readFileSync(CSS, "utf8");
    const scroll = /\.tr-nav-scroll\s*\{([^}]*)\}/.exec(css)![1];
    // The affordance: a rule drawn exactly where the content is cut, and a
    // snap so a flick lands on a whole label. `proximity`, never `mandatory` --
    // mandatory would fight a reader trying to reach the last entry.
    expect(scroll).toMatch(/border-right:\s*1px\s+solid\s+var\(--color-pr-rule\)/);
    expect(scroll).toMatch(/scroll-snap-type:\s*x\s+proximity/);
    expect(/\.tr-nav-scroll\s*>\s*ul\s*>\s*li\s*\{[^}]*scroll-snap-align:\s*start/.test(css)).toBe(true);
    // No gradient of any kind: the affordance is a rule and a snap, and a
    // future session should not reach for a fade here by default.
    expect(scroll).not.toMatch(/gradient|mask-image/);
    // The coupling the review held this fix to: the 1px rule is WIDTH, so the
    // nav stays 3rem and the sections still clear it by 4rem.
    expect(/\.tr-nav\s*\{[^}]*height:\s*3rem/.test(css)).toBe(true);
    expect(/\.tr-section\s*\{[^}]*scroll-margin-top:\s*4rem/.test(css)).toBe(true);
    // And the class is applied, so the rule is attached to something.
    const { container } = await renderPage();
    expect(container.querySelector(".tr-nav-scroll")).not.toBeNull();
  });

  it("puts the 50% reference at the middle of the bar, always", async () => {
    const css = readFileSync(CSS, "utf8");
    const marker = /\.tr-bar-marker\s*\{([^}]*)\}/.exec(css)![1];
    // Half the TRACK, not half the fill: this is a property of the scale.
    expect(marker).toMatch(/left:\s*50%/);
    const track = /\.tr-bar\s*\{([^}]*)\}/.exec(css)![1];
    expect(track).toMatch(/position:\s*relative/);
    expect(track).toMatch(/background:\s*var\(--color-pr-panel-2\)/);

    // The stylesheet says the marker is positioned against the track; that is
    // only true if the page puts a marker inside every bar it draws. Counting
    // the rendered classes catches the other half of the coupling -- a
    // `className="tr-bar"` renamed to a utility would leave the two CSS
    // assertions above green and every 50% line off the page.
    const { container } = await renderPage();
    expect(container.querySelectorAll(".tr-bar").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".tr-bar-marker").length).toBe(
      container.querySelectorAll(".tr-bar").length,
    );
  });
});

// --- 11. the constraints that are not about data ----------------------------

describe("the constraints that are not about data", () => {
  it("sets no font size below 12px anywhere on the page", () => {
    // The floor is a floor: no utility may buy a smaller number back. BOTH
    // units, because the old guard matched `text-[Npx]` only and a
    // `text-[0.7rem]` -- 11.2px, under the floor -- walked straight past it.
    // Anything the guard cannot parse fails rather than passing quietly.
    for (const [, value, unit] of source.matchAll(/text-\[(\d+(?:\.\d+)?)(px|rem|em)\]/g)) {
      const px = unit === "px" ? Number(value) : Number(value) * 16;
      expect(px, `text-[${value}${unit}] is ${px}px, under the 12px floor`).toBeGreaterThanOrEqual(12);
    }
    // 0.75rem is exactly 12px, so anything under it is a violation and the
    // assertion above would say so; this one is the same floor in its own
    // unit, spelled out so the intent survives a reader who never converts.
    for (const [, value] of source.matchAll(/text-\[(\d+(?:\.\d+)?)rem\]/g)) {
      expect(Number(value), `text-[${value}rem] is under 0.75rem`).toBeGreaterThanOrEqual(0.75);
    }
  });

  it("never lets colour alone carry a meaning", async () => {
    // Every direction this page shows is also a word, so nothing is encoded
    // only in a sign or a hue. The three words are asserted by name.
    expect(source).toMatch(/biasWord/);
    expect(source).toMatch(/edgeWord/);
    // And on a page that DID render, no status colour is doing the work: the
    // one that is allowed is checked by the next test, on the error path,
    // where it has a role and words with it. Asserting a token ban here
    // instead would have been the weaker claim -- the old guard
    // (`/pr-win|pr-loss|pr-lean/`) did not even match `text-loss`, the token
    // this page actually uses, so it was green for a reason that had nothing
    // to do with the constraint.
    const { container } = await renderPage();
    expect(statusColoured(container)).toEqual([]);
  });

  it("lets the load-failure line wear a status colour, because it has words and a role", async () => {
    trackRecord.mockRejectedValue(new Error("the tracker did not answer"));
    const { container } = render(<TrackRecordPage />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("the tracker did not answer");
    // The colour is a REDUNDANT cue on a sentence a screen reader announces
    // anyway. It is not the carrier, and the assertion is that the page still
    // says the same thing with the colour stripped.
    expect(statusColoured(container).map((el) => el.getAttribute("role"))).toEqual(["alert"]);
    expect(alert.textContent?.trim()).toBe("the tracker did not answer");
  });

  it("keeps every text colour it uses at 4.5:1 on every surface it sits on", () => {
    const tokens = readFileSync(TOKENS, "utf8");
    const hex = (name: string) => new RegExp(`--color-${name}:\\s*(#[0-9a-f]{6})`, "i").exec(tokens)![1];
    const surfaces = ["pr-stage", "pr-panel", "pr-panel-2"].map(hex);
    for (const ink of ["pr-text", "pr-text-dim", "pr-text-faint"]) {
      for (const surface of surfaces) {
        // WCAG 1.4.3. `--color-pr-rule` is deliberately not in the surface
        // list: text-faint on it measures 4.47:1, under the bar, so no text of
        // any size may be placed on it.
        expect(contrast(hex(ink), surface), `${ink} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("draws the accuracy fill at 3:1 or better against its track, in every sport's accent", () => {
    // WCAG 1.4.11, non-text contrast: the bar fill is the only thing carrying
    // the value, so it has to be visible as a shape and not only as a number.
    const tokens = readFileSync(TOKENS, "utf8");
    const track = /--color-pr-panel-2:\s*(#[0-9a-f]{6})/i.exec(tokens)![1];
    const accents = [...tokens.matchAll(/\[data-sport="(\w+)"\]\s*\{[^}]*--color-pr-accent:\s*(#[0-9a-f]{6})/gi)];
    expect(accents.length).toBeGreaterThanOrEqual(6);
    for (const [, sport, accent] of accents) {
      expect(contrast(accent!, track), `${sport}'s accent on the bar track`).toBeGreaterThanOrEqual(3);
    }
  });

  it("gives the nav a focus ring that stays on screen when the nav is pinned", () => {
    // The family draws focus at +2px, and this strip sits at the very top of
    // the viewport when pinned, so half the ring would be off screen.
    expect(/\.tr-nav a\s*\{[^}]*outline-offset:\s*-2px/.test(readFileSync(CSS, "utf8"))).toBe(true);
  });
});
