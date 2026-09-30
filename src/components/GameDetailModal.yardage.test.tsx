import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { yardageBreakdown, GameDetailModal, MARKET_LABEL } from "./GameDetailModal";
import type { GameSummary, PlayerPropPrediction, SportApi } from "../types";

vi.mock("../context/SportContext", () => ({
  useSport: () => ({ sport: "nfl", setSport: () => {}, api: {} }),
}));

const game: GameSummary = {
  game_id: "2026_01_KC_BAL", season: 2026, week: 1, gameday: "2026-09-07T20:00:00Z",
  home_team: "Ravens", away_team: "Chiefs", home_score: null, away_score: null,
};

function qb(name: string, passing: number): PlayerPropPrediction {
  return { player_id: name, player_name: name, recent_team: "Ravens", position: "QB", anytime_td_prob: 0.5, passing_yards: passing };
}
function rb(name: string, rushing: number): PlayerPropPrediction {
  return { player_id: name, player_name: name, recent_team: "Ravens", position: "RB", anytime_td_prob: 0.3, rushing_yards: rushing };
}
function wr(name: string, receiving: number): PlayerPropPrediction {
  return { player_id: name, player_name: name, recent_team: "Ravens", position: "WR", anytime_td_prob: 0.2, receiving_yards: receiving };
}

function mockApi(props: PlayerPropPrediction[] = []): SportApi {
  return {
    games: vi.fn(),
    gamePrediction: vi.fn().mockResolvedValue({ home_win_prob: 0.6, away_win_prob: 0.4, home_cover_prob: null, away_cover_prob: null, over_prob: null, under_prob: null }),
    playerProps: vi.fn().mockResolvedValue(props),
    trackRecord: vi.fn(), retrain: vi.fn(), gameVerdict: vi.fn().mockResolvedValue(null),
    predictionsForWeek: vi.fn(), currentWeek: vi.fn(), standings: vi.fn(), powerRankings: vi.fn(),
    predictionsBatch: vi.fn(), teamForm: vi.fn().mockResolvedValue({ team: "", recent_form: [] }),
    headToHead: vi.fn().mockResolvedValue({ game_id: "", meetings: [] }),
  } as unknown as SportApi;
}

// The original defect: the roster's single yardage field per player was summed
// into a box labelled "Total". The model projects one yardage *market* per
// position (NFL/CFB `models/player_props.py::POSITION_MARKETS`), so that sum
// added a QB's passing yards to an RB's rushing and a WR's receiving, and
// labelled the result as though it were team total yards. On a real roster it
// landed at 800-1400 yards, which is not a real NFL or CFB number.
describe("yardageBreakdown", () => {
  it("never sums across incompatible markets", () => {
    const breakdown = yardageBreakdown([qb("Lamar", 280), rb("Mark", 90), wr("Zay", 110)]);
    expect(breakdown.map(m => m.yards)).toEqual([280, 90, 110]);
    expect(breakdown.reduce((sum, m) => sum + m.yards, 0)).toBe(480);
  });

  it("reports how many players contributed to each market", () => {
    const breakdown = yardageBreakdown([qb("Lamar", 280), rb("Mark", 90), rb("Gus", 70), wr("Zay", 110)]);
    expect(breakdown.find(m => m.market === "rushing_yards")?.n).toBe(2);
    expect(breakdown.find(m => m.market === "passing_yards")?.n).toBe(1);
  });

  it("omits a market no player was projected for, rather than showing zero", () => {
    const breakdown = yardageBreakdown([qb("Lamar", 280)]);
    expect(breakdown.map(m => m.market)).toEqual(["passing_yards"]);
  });

  it("tolerates a missing or non-numeric yardage value", () => {
    const broken = { ...qb("Lamar", 280), passing_yards: undefined } as PlayerPropPrediction;
    expect(yardageBreakdown([broken])).toEqual([]);
  });

  it("ignores a NaN yardage rather than poisoning the market sum", () => {
    // `typeof NaN === "number"`, so a type check alone lets it through. It then
    // renders as `NaN` and makes the whole market total NaN, so one bad row
    // destroys every other player's figure in the panel.
    const nan = { ...qb("Lamar", 280), passing_yards: NaN } as PlayerPropPrediction;
    expect(yardageBreakdown([nan])).toEqual([]);
    const mixed = yardageBreakdown([nan, qb("Tua", 250)]);
    expect(mixed).toHaveLength(1);
    expect(mixed[0].yards).toBe(250);
  });
});

describe("GameDetailModal team totals", () => {
  /**
   * The strip itself, not the modal.
   *
   * The old side-by-side "Projected Yardage by Market" cards are gone (A4's
   * dedup rule): the strip at the end of the box-score section carries their
   * numbers — one row per team, each market with the count it was summed from.
   * The modal also carries the predicted box score, whose QB column header is
   * also "Pass yds", so on one screen the same label legitimately appears
   * twice, and a bare `getByText("Pass yds")` no longer says which of the two
   * it meant. Scoping the query to this strip is what keeps the assertion
   * about the strip. Every string asserted here is unchanged from the cards;
   * what changed is where the numbers live. The mutation these tests exist to
   * catch (`Math.round(market.yards * 2)`) still fails all of them.
   */
  function strip() {
    return within(screen.getByTestId("box-score-team-totals"));
  }

  it("does not present a single number labelled as the team's total", async () => {
    const api = mockApi([qb("Lamar", 280), rb("Mark", 90), wr("Zay", 110)]);
    render(<GameDetailModal game={game} api={api} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lamar")).toBeInTheDocument());
    expect(screen.queryByText(/Total: 480/)).not.toBeInTheDocument();
  });

  it("shows each market separately with its own label", async () => {
    const api = mockApi([qb("Lamar", 280), rb("Mark", 90), wr("Zay", 110)]);
    render(<GameDetailModal game={game} api={api} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lamar")).toBeInTheDocument());
    expect(strip().getByText("Pass yds")).toBeInTheDocument();
    expect(strip().getByText("Rush yds")).toBeInTheDocument();
    expect(strip().getByText("Rec yds")).toBeInTheDocument();
  });

  it("renders the actual projected yardage, not just the labels", async () => {
    // The label-only version of this test passed with the render mutated to
    // `Math.round(market.yards * 2)` -- all 139 tests green against a number that
    // was wrong by 100%. Asserting the values is what makes the strip honest.
    // Scoped to the team's own row: the box score above prints the same
    // numbers in its player cells.
    const api = mockApi([qb("Lamar", 280), rb("Mark", 90), wr("Zay", 110)]);
    render(<GameDetailModal game={game} api={api} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lamar")).toBeInTheDocument());
    const row = strip().getAllByTestId("box-score-team-total").find((r) => r.textContent?.includes("Ravens total"))!;
    expect(within(row).getByText("280")).toBeInTheDocument();
    expect(within(row).getByText("90")).toBeInTheDocument();
    expect(within(row).getByText("110")).toBeInTheDocument();
  });

  it("sums a market across players and shows how many contributed", async () => {
    const api = mockApi([qb("Lamar", 280), rb("Mark", 60), rb("Gus", 30), wr("Zay", 110)]);
    render(<GameDetailModal game={game} api={api} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lamar")).toBeInTheDocument());
    // 60 + 30. The count is the strip's alone: the box score prints no sums now.
    const row = strip().getAllByTestId("box-score-team-total").find((r) => r.textContent?.includes("Ravens total"))!;
    expect(within(row).getByText("90")).toBeInTheDocument();
    expect(within(row).getByText("(2)")).toBeInTheDocument();
  });

  it("states both why these are not a team yardage total", async () => {
    // The roster-vs-on-field point is half the original defect: summing every
    // projected player includes third-stringers who will not carry the ball.
    const api = mockApi([qb("Lamar", 280), rb("Mark", 90), wr("Zay", 110)]);
    render(<GameDetailModal game={game} api={api} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lamar")).toBeInTheDocument());
    // The caveat is the point of the change: a reader must not add these up.
    expect(screen.getByText(/not team total yards/i)).toBeInTheDocument();
    expect(screen.getByText(/whole roster rather than the expected on-field lineup/i)).toBeInTheDocument();
  });

  it("hides the strip entirely when no team has a yardage projection", async () => {
    // A kicker: no yardage market, and no position group in the box score
    // either, so nothing about this player renders a name anywhere. Since A4
    // removed the flat "Model Player Projections" list, there is no longer a
    // player name on the page to wait for -- the modal prints its no-modelled-
    // positions state instead, and that is what the wait below is for. The
    // assertion this test exists for is unchanged. The wording is matched
    // loosely on purpose: it is A4's, it is not this test's subject, and a
    // reword should not fail a test about the totals strip.
    const api = mockApi([{ player_id: "p", player_name: "p", recent_team: "Ravens", position: "K", anytime_td_prob: 0.1 }]);
    render(<GameDetailModal game={game} api={api} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/No modelled positions for this game|No player projection props available/)).toBeInTheDocument());
    expect(screen.queryByTestId("box-score-team-totals")).not.toBeInTheDocument();
  });
});

// A label bound to the wrong number is the one thing the relabelling exists to
// prevent, and no assertion here could catch it. Swapping the labels for
// `passing_yards` and `rushing_yards` produced real rendered output reading
// "Ravens Rush yds 280" for a quarterback, with all the other tests green.
//
// The suite pins that the label *strings* appear, which is "a value was produced".
// This pins that each label appears next to its own value and not a neighbour's —
// the actual property under review.
describe('yardageBreakdown label binding', () => {
  const passingProp = {
    player_id: 'p1', player_name: 'Lamar Jackson', position: 'QB', recent_team: 'BAL',
    passing_yards: 280, rushing_yards: 0, receiving_yards: 0,
  };
  const rushingProp = {
    player_id: 'p2', player_name: 'Derrick Henry', position: 'RB', recent_team: 'BAL',
    passing_yards: 0, rushing_yards: 120, receiving_yards: 0,
  };

  it('binds each market label to its own value', () => {
    const markets = yardageBreakdown([passingProp, rushingProp] as never[]);

    const passing = markets.find(m => m.market === 'passing_yards');
    const rushing = markets.find(m => m.market === 'rushing_yards');

    expect(passing?.yards).toBe(280);
    expect(rushing?.yards).toBe(120);
    // The rendered label has to travel with its own number, or the panel states
    // that a quarterback rushed for 280 yards.
    expect(`${MARKET_LABEL.passing_yards} ${passing?.yards}`).toBe('Pass yds 280');
    expect(`${MARKET_LABEL.rushing_yards} ${rushing?.yards}`).toBe('Rush yds 120');
  });

  it('counts a player once per market, not once per (player, market) pair', () => {
    // A player with a real number in two yardage markets contributes to both, which is
    // correct -- and is exactly why the "one yardage market per position" claim this
    // PR removed was never safe to rely on.
    const twoMarket = {
      player_id: 'p3', player_name: 'Two Market', position: 'RB', recent_team: 'BAL',
      passing_yards: 40, rushing_yards: 60, receiving_yards: 0,
    };

    const markets = yardageBreakdown([twoMarket] as never[]);
    const passing = markets.find(m => m.market === 'passing_yards');
    const rushing = markets.find(m => m.market === 'rushing_yards');

    expect(passing).toEqual({ market: 'passing_yards', yards: 40, n: 1 });
    expect(rushing).toEqual({ market: 'rushing_yards', yards: 60, n: 1 });
  });
});
