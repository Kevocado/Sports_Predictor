/**
 * ONE rule with teeth: the same pick is never two different numbers on the two
 * surfaces.
 *
 * The week cards (`GamesPage`) and the track record (`TrackRecordPage`) are two
 * renderings of one stored record, and this repo has shipped them disagreeing:
 * the same pick read 68% on a card and 72% in a tile, because each surface
 * defined "the pick's probability" from a different endpoint. That defect was
 * fixed by making both call one function; the counted-picks swap adds a second
 * way for the same pick to be two numbers, which is the figure set:
 *
 *   - the week's tally counts every counted pick, and the track record's
 *     headline counts every counted pick. Two surfaces, one population, and
 *     they must agree on WHO is in it and on whether each pick was right.
 *   - the pre-kickoff subset is the secondary figure on BOTH, and it must be
 *     the same subset of the same rows.
 *
 * So this file asserts the agreement, not the copy: it builds ONE payload,
 * feeds it to both pages, and checks the numbers line up. A copy change on
 * either surface can pass; a second definition of the tally cannot.
 *
 * Everything is seeded. A parity test that fetches its own fixtures proves
 * something about the network, not about the agreement.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { GamesPage } from "./pages/GamesPage";
import { TrackRecordPage } from "./pages/TrackRecordPage";
import type {
  GamePrediction,
  GameSummary,
  SportApi,
  TrackRecord,
  WeekPrediction,
} from "./types";

// --- the one payload --------------------------------------------------------

/**
 * Two games in one week, and the week rows that recorded their picks.
 *
 * `g1` was picked before kickoff and was right. `g2`'s pick was recorded after
 * its own kickoff -- the case this whole change is about -- and was wrong.
 * The one thing both surfaces must agree on: `g2` COUNTS, and its timing is
 * disclosed rather than used to drop it.
 */
const g1: GameSummary = {
  game_id: "g1", season: 2026, week: 7, gameday: "2026-10-04T17:00:00Z",
  home_team: "Ravens", away_team: "Chiefs", home_score: 24, away_score: 17,
};
// The late pick was BILLS (away, 60% in the stored row) and it lost 10–21 at
// home to the Jets, so it is counted and it is wrong. A miss matters here: a
// test whose post-kickoff pick happened to hit cannot tell a counted pick from
// a lucky one.
const g2: GameSummary = {
  game_id: "g2", season: 2026, week: 7, gameday: "2026-10-04T20:00:00Z",
  home_team: "Jets", away_team: "Bills", home_score: 21, away_score: 10,
};

const weekRows: WeekPrediction[] = [
  {
    game_id: "g1", status: "resolved", home_win_prob: 0.62, away_win_prob: 0.38,
    verdict: { game_id: "g1", resolved: true, moneyline: { hit: true, predicted: "Ravens" }, ats: null, totals: null },
  },
  {
    game_id: "g2", status: "resolved", rebuilt: true, home_win_prob: 0.4, away_win_prob: 0.6,
    verdict: { game_id: "g2", resolved: true, moneyline: { hit: false, predicted: "Jets" }, ats: null, totals: null },
  },
];

/**
 * The record, transcribed from the SAME rows above rather than invented
 * alongside them. That is what makes the assertions below meaningful: both
 * pages are reading one stored record, so any disagreement is the frontend's.
 *
 * The arithmetic is checked here rather than only asserted downstream, so a
 * fixture that drifts from the week rows fails as a fixture and not as a
 * mysterious rendering difference.
 */
const RECORD: TrackRecord = {
  games: {
    // 2 counted picks: one per game. `n_resolved` is the FULL population now.
    n_resolved: 2,
    n_rebuilt: 1,
    n_moneyline: 2,
    n_ats: 0,
    n_totals: 0,
    pct_moneyline_correct: 0.5,
    pct_ats_correct: null,
    pct_totals_correct: null,
    // 1 of the 2 was made before its own kickoff: g2's was not.
    pre_kickoff: {
      n_resolved: 1,
      n_moneyline: 1,
      n_ats: 0,
      n_totals: 0,
      pct_moneyline_correct: 1.0,
      pct_ats_correct: null,
      pct_totals_correct: null,
    },
    per_pick: [
      {
        game_id: "g1", gameday: "2026-10-04T17:00:00Z", market: "moneyline",
        pick: "Ravens", actual: "Ravens", hit: true,
        made_before_kickoff: true, snapshotted_at: "2026-10-04T14:00:00Z", rebuilt: false,
      },
      {
        game_id: "g2", gameday: "2026-10-04T20:00:00Z", market: "moneyline",
        pick: "Bills", actual: "Jets", hit: false,
        made_before_kickoff: false, snapshotted_at: "2026-10-04T21:10:00Z", rebuilt: true,
      },
    ],
  },
  player_props: {
    anytime_td: { n_resolved: 0, n_called: 0, hit_rate_when_called: null, brier_score: null, confidence_buckets: [] },
    passing_yards: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null },
    rushing_yards: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null },
    receiving_yards: { n_resolved: 0, mean_absolute_error: null, mean_signed_error: null },
  },
} as unknown as TrackRecord;

const pred = (home: number): GamePrediction => ({
  home_win_prob: home, away_win_prob: 1 - home,
  home_cover_prob: null, away_cover_prob: null, over_prob: null, under_prob: null,
});

const trackRecord = vi.fn(async (): Promise<TrackRecord> => RECORD);

const api = {
  trackRecord,
  games: vi.fn(async () => [g1, g2]),
  gamePrediction: vi.fn(async () => pred(0.5)),
  predictionsBatch: vi.fn(async () => ({})),
  predictionsForWeek: vi.fn(async () => weekRows),
  currentWeek: vi.fn(async () => ({ season: 2026, week: 7 })),
  playerProps: vi.fn(async () => []),
  gameVerdict: vi.fn(),
  retrain: vi.fn(),
  standings: vi.fn(),
  powerRankings: vi.fn(),
  teamForm: vi.fn(),
  headToHead: vi.fn(),
} as unknown as SportApi;

vi.mock("./context/SportContext", () => ({
  useSport: () => ({ sport: "nfl", setSport: () => {}, api }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  trackRecord.mockResolvedValue(RECORD);
});

/** Everything either page rendered, so both are read the same way. */
function body(): string {
  return document.body.textContent ?? "";
}

/** The `hits/settled` the week cards state, read out of their own wording. */
function cardTally(): { hits: number; settled: number } {
  const m = /(\d+)\/(\d+) picks counted correct/.exec(body());
  expect(m, `no counted tally on the cards; page read:\n${body()}`).not.toBeNull();
  return { hits: Number(m![1]), settled: Number(m![2]) };
}

/** The `k of n` the week cards state for their pre-kickoff subset. */
function cardPreKickoff(): { hits: number; settled: number } {
  const m = /(\d+) of (\d+) made before kickoff/.exec(body());
  expect(m, `no pre-kickoff figure on the cards; page read:\n${body()}`).not.toBeNull();
  return { hits: Number(m![1]), settled: Number(m![2]) };
}

/** The record's per-pick rows, in payload order. */
function pickRows(): HTMLElement[] {
  return [
    ...screen.getByRole("table", { name: /per-pick detail/i }).querySelectorAll<HTMLElement>("tbody tr"),
  ];
}

async function renderCards() {
  render(<GamesPage />);
  await waitFor(() => expect(screen.getAllByText(/^Pick: /).length).toBe(2));
}

// --- the fixture is one record ----------------------------------------------

describe("the payload the two surfaces share is itself consistent", () => {
  it("agrees with the week rows it was transcribed from", () => {
    // Proved first, so a later failure is about the SURFACES rather than about
    // a fixture that drifted. The counted key is (game, market): one moneyline
    // pick per game, and the earliest recorded one is the counted one.
    const counted = RECORD.games.per_pick!;
    expect(counted).toHaveLength(RECORD.games.n_resolved);
    const preKickoff = counted.filter((r) => r.made_before_kickoff);
    expect(preKickoff).toHaveLength(RECORD.games.pre_kickoff!.n_resolved);
    expect(counted.length - preKickoff.length).toBe(RECORD.games.n_rebuilt!);
    // The headline's rate is the count's own arithmetic, and the subset's too.
    expect(counted.filter((r) => r.hit).length / counted.length).toBe(RECORD.games.pct_moneyline_correct);
    expect(preKickoff.filter((r) => r.hit).length / preKickoff.length).toBe(
      RECORD.games.pre_kickoff!.pct_moneyline_correct,
    );
    // And the week rows hold the same verdicts the pick rows record.
    for (const row of counted) {
      const week = weekRows.find((w) => w.game_id === row.game_id)!;
      expect(week.status).toBe("resolved");
      expect(week.verdict!.moneyline.hit).toBe(row.hit);
      expect(!!week.rebuilt).toBe(!row.made_before_kickoff);
    }
  });
});

// --- the agreement ----------------------------------------------------------

describe("the two surfaces, reading one record", () => {
  it("counts the same picks on both, and agrees on every one of them", async () => {
    await renderCards();
    const tally = cardTally();
    // 1 right of 2 counted, and 2 counted -- including g2, made after kickoff.
    expect(tally).toEqual({ hits: 1, settled: 2 });

    render(<TrackRecordPage />);
    await screen.findByTestId("accuracy-bar-moneyline");
    // The record's per-pick list IS the tally's population, one row per counted
    // pick, so a reader tallying the list arrives at the number the cards state.
    const rows = pickRows();
    expect(rows).toHaveLength(tally.settled);
    const hits = rows.filter((r) => within(r).queryByText("hit")).length;
    expect(hits).toBe(tally.hits);
    // The same n the API reports as the headline.
    expect(tally.settled).toBe(RECORD.games.n_resolved);
    // And the same two verdicts the cards judged their badges on.
    expect(within(rows[0]).getByText("hit")).toBeInTheDocument();
    expect(within(rows[1]).getByText("miss")).toBeInTheDocument();
  });

  it("reports the SAME pre-kickoff subset on both surfaces", async () => {
    await renderCards();
    const card = cardPreKickoff();
    // 1 of the 2 counted picks was made before its own kickoff.
    expect(card).toEqual({ hits: 1, settled: 1 });

    render(<TrackRecordPage />);
    await screen.findByTestId("accuracy-bar-moneyline");
    const section = document.getElementById("tr-pre-kickoff")!;
    // The secondary figure's own denominator, from the same block.
    expect(within(section).getByText("1 game graded")).toBeInTheDocument();
    expect(card.settled).toBe(RECORD.games.pre_kickoff!.n_resolved);
    expect(RECORD.games.pre_kickoff!.n_resolved).toBe(
      RECORD.games.n_resolved - RECORD.games.n_rebuilt!,
    );
  });

  it("shows the same pick on a card and on the record's row for that game", async () => {
    // The 68/72 class of defect, restated for the counted-picks swap: one pick,
    // two renderings, one answer. A card reading the fresh model where the
    // record reads the stored pick is exactly what this asserts against.
    await renderCards();
    expect(screen.getByText(/^Pick: Ravens · 62%$/)).toBeInTheDocument();
    expect(screen.getByText(/^Pick: Bills · 60%$/)).toBeInTheDocument();
    // `gamePrediction` answers 50/50 for every game, so a card reading the fresh
    // model would print 50% on both. It must not.
    expect(body()).not.toContain("50%");

    render(<TrackRecordPage />);
    await screen.findByTestId("accuracy-bar-moneyline");
    const rows = pickRows();
    // Cell-indexed rather than getByText: "Ravens" is the pick AND the actual on
// the row that landed, so a bare getByText is ambiguous there and would pass
    // for the wrong reason. Columns are Game / Gameday / Market / Pick / Actual /
    // Hit / When made / Time made on this payload.
    const cells = (row: HTMLElement) => [...row.querySelectorAll("td")].map((c) => c.textContent?.trim());
    // Pick column, then the actual it lost to.
    expect(cells(rows[0])[3]).toBe("Ravens");
    expect(cells(rows[0])[5]).toBe("hit");
    expect(cells(rows[1])[3]).toBe("Bills");
    expect(cells(rows[1])[4]).toBe("Jets");
    expect(cells(rows[1])[5]).toBe("miss");
    // The card named the same side the record says was picked.
    expect(body()).toContain("Pick: Ravens · 62%");
    expect(body()).toContain("Pick: Bills · 60%");
  });

  it("lets neither surface call a counted pick uncounted", async () => {
    await renderCards();
    expect(body()).not.toMatch(/not\s+counted/i);
    render(<TrackRecordPage />);
    await screen.findByTestId("accuracy-bar-moneyline");
    expect(body()).not.toMatch(/not\s+counted/i);
    // The disclosure that replaced exclusion: the pick is counted AND the moment
    // it was made is stated. Both halves, on both surfaces.
    expect(body()).toMatch(/made after kickoff/i);
  });
});