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

/** NFL's `/track-record`, as `_summarize_games` and `_summarize_player_props` emit it. */
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
    weekly: [
      // B2's own arithmetic: four games at 50%, then one game, won.
      { week: 1, tracked: true, n_games: 4, n_moneyline: 4, pct_moneyline_correct: 0.5, n_ats: 2, pct_ats_correct: 1.0, n_totals: 1, pct_totals_correct: 0.0 },
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
      method: {
        sigma_league_points: 13.5,
        sigma_league_meaning: "NFL final margin is treated as roughly Normal with a standard deviation of 13.5 points.",
        implied_probability: "The closing line is a margin, so the probability the market is asserting is Φ(spread / 13.5).",
        edge: "Edge is the model's cover probability minus the probability the closing line implies, in percentage points.",
        disagreement: "The disagreement cohort is the games where the model backed the side the line did not favour.",
        not_a_profit_claim: "This is agreement with a price, not a profit claim. No figure here is a return, a yield, a stake or a cent.",
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
 * CFB's `/track-record`, which has not had B2-B5: still `weekly_trend`, no
 * per-market counts, no points forecasts, no `vs_market`, and a
 * `mae_by_position` map with no count beside it.
 *
 * This fixture is the reason the new keys in types.ts are optional. One site
 * serves both sports off `?sport=`, so a CFB payload that throws is not a
 * cosmetic problem — it is the same crash B6 was commissioned to end, on the
 * other half of the site.
 */
const CFB_RECORD = {
  games: {
    n_resolved: 12,
    n_rebuilt: 0,
    pct_moneyline_correct: 0.583,
    pct_ats_correct: 0.5,
    pct_totals_correct: null,
  },
  player_props: {
    anytime_td: { n_resolved: 30, n_called: 20, hit_rate_when_called: 0.6, brier_score: 0.18, confidence_buckets: [] },
    passing_yards: { n_resolved: 40, mean_absolute_error: 32.4, mean_signed_error: 4.1, mae_by_position: { QB: 32.4 } },
    rushing_yards: { n_resolved: 40, mean_absolute_error: 18.1, mean_signed_error: -2.2, mae_by_position: { RB: 18.1 } },
    receiving_yards: { n_resolved: 40, mean_absolute_error: 21.7, mean_signed_error: 1.1, mae_by_position: { WR: 21.7 } },
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

async function renderPage() {
  const result = render(<TrackRecordPage />);
  // Every test waits on a value inside a section, so a section that stops
  // rendering fails here by timing out rather than by passing quietly.
  await screen.findByText("Moneyline accuracy");
  return result;
}

// --- 1. the headline --------------------------------------------------------

describe("headline", () => {
  it("gives each market the count of ITS OWN graded games, not the row count", async () => {
    await renderPage();
    // 6 resolved, 4 ATS grades, 3 total grades. Three different denominators,
    // and the ATS card must not say 6.
    const [ml, ats, totals] = ["Moneyline accuracy", "Spread (ATS) accuracy", "Total (O/U) accuracy"].map(
      (label) => screen.getByText(label).parentElement!,
    );
    expect(within(ml).getByText("6 games graded")).toBeInTheDocument();
    expect(within(ats).getByText("4 games graded")).toBeInTheDocument();
    expect(within(totals).getByText("3 games graded")).toBeInTheDocument();
    expect(within(ats).queryByText("6 games graded")).not.toBeInTheDocument();
    expect(within(totals).queryByText("6 games graded")).not.toBeInTheDocument();
  });

  it("says the record is pre-kickoff, out loud, not as a footnote", async () => {
    await renderPage();
    const note = screen.getByTestId("rebuilt-note");
    expect(note).toHaveTextContent("2 picks rebuilt after kickoff are shown on their games but not counted here.");
    // A footnote is a smaller, dimmer thing than this; assert the size class.
    expect(note.className).toContain("text-sm");
    expect(note.className).not.toContain("text-xs");
  });

  it("says so even when nothing was rebuilt, rather than hiding the rule", async () => {
    trackRecord.mockResolvedValue({ ...NFL_RECORD, games: { ...NFL_RECORD.games, n_rebuilt: 0 } });
    await renderPage();
    expect(screen.getByTestId("rebuilt-note")).toHaveTextContent(
      "Every pick in this record was made before its game started.",
    );
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
    const moneyline = screen.getByText("Moneyline accuracy").parentElement!;
    expect(within(moneyline).getByText("67%")).toBeInTheDocument();
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
    expect(within(rowAt(table, 0)).getByText(wholeText("50% (4)"))).toBeInTheDocument();
    expect(within(rowAt(table, 1)).getByText(wholeText("100% (1)"))).toBeInTheDocument();
  });

  // The bar fix. Reverting this makes the width 25% instead of 100%.
  it("draws a week bar on the accuracy scale alone, and the game count as text", async () => {
    const { container } = await renderPage();
    expect(barWidths(container, "week-bar")).toEqual(["50%", "100%"]);
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
    const qb = within(table).getByText("QB").closest("tr")!;
    expect(within(qb).getByText("±32.4 yd")).toBeInTheDocument();
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

  it("leads with the disagreement cohort, over the games in it", async () => {
    await renderPage();
    expect(screen.getByText(/Hit rate over 1 game where it disagreed with the line/)).toBeInTheDocument();
    expect(screen.getByText(/Game IDs in this cohort/)).toHaveTextContent("401547");
  });

  it("prints every method sentence from the payload, verbatim", async () => {
    await renderPage();
    for (const sentence of Object.values(NFL_RECORD.games.vs_market!.method).filter((v) => typeof v === "string")) {
      expect(screen.getByText(sentence as string)).toBeInTheDocument();
    }
    // σ_league as a number, next to what it means.
    expect(screen.getByText("13.5 points")).toBeInTheDocument();
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
    await screen.findByText("Moneyline accuracy");
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
    expect(screen.getByText("12 games graded")).toBeInTheDocument();
    // The ATS card has no count to print and says so rather than borrowing
    // the moneyline's.
    const ats = screen.getByText("Spread (ATS) accuracy").closest("div")!;
    expect(within(ats).getByText("grade count not reported")).toBeInTheDocument();
    // And each absent block says why, instead of rendering nothing at all.
    expect(screen.getAllByTestId("not-recorded").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("This backend does not report a week-by-week record yet.")).toBeInTheDocument();
  });
});

// --- 10. the section nav ----------------------------------------------------

describe("the section nav", () => {
  it("links to a section that exists, and every section has an entry", async () => {
    await renderPage();
    const nav = screen.getByRole("navigation", { name: /track record sections/i });
    const hrefs = [...nav.querySelectorAll("a")].map((a) => a.getAttribute("href")!);
    expect(hrefs).toEqual([
      "#tr-headline", "#tr-week", "#tr-props", "#tr-yards", "#tr-position", "#tr-points", "#tr-market",
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
  it("is sticky, opaque, and sized so an anchor jump clears it", () => {
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
  });

  it("puts the 50% reference at the middle of the bar, always", () => {
    const css = readFileSync(CSS, "utf8");
    const marker = /\.tr-bar-marker\s*\{([^}]*)\}/.exec(css)![1];
    // Half the TRACK, not half the fill: this is a property of the scale.
    expect(marker).toMatch(/left:\s*50%/);
    const track = /\.tr-bar\s*\{([^}]*)\}/.exec(css)![1];
    expect(track).toMatch(/position:\s*relative/);
    expect(track).toMatch(/background:\s*var\(--color-pr-panel-2\)/);
  });
});

// --- 11. the constraints that are not about data ----------------------------

describe("the constraints that are not about data", () => {
  it("sets no font size below 12px anywhere on the page", () => {
    // The floor is a floor: no utility may buy a smaller number back.
    for (const [, px] of source.matchAll(/text-\[(\d+(?:\.\d+)?)px\]/g)) {
      expect(Number(px), `text-[${px}px] is under the 12px floor`).toBeGreaterThanOrEqual(12);
    }
  });

  it("never lets colour alone carry a meaning", () => {
    // Every direction this page shows is also a word, so nothing is encoded
    // only in a sign or a hue. The three words are asserted by name.
    expect(source).toMatch(/biasWord/);
    expect(source).toMatch(/edgeWord/);
    // And the status tokens are never used on this page, which is the one
    // place a colour would be doing the work.
    expect(source).not.toMatch(/pr-win|pr-loss|pr-lean/);
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
