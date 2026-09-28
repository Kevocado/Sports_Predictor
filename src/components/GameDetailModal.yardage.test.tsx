import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { yardageBreakdown, GameDetailModal } from "./GameDetailModal";
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

describe("GameDetailModal yardage panel", () => {
  /**
   * The block itself, not the modal.
   *
   * Since A4 the modal also carries a predicted box score, whose QB column
   * header is also "Pass yds" and whose per-position totals row is also the sum
   * of that market for the roster. So on one screen the same label and the same
   * number legitimately appear twice, and a bare `getByText("Pass yds")` no
   * longer says which of the two it meant -- it threw "Found multiple
   * elements". Scoping the query to this block is what keeps the assertion
   * about the block, which is what the test names. Every string asserted here
   * is unchanged; what changed is that the query can no longer be satisfied by
   * the box score. The mutation these tests exist to catch
   * (`Math.round(market.yards * 2)`) still fails all of them.
   */
  function panel() {
    return within(screen.getByTestId("yardage-by-market"));
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
    expect(panel().getByText("Pass yds")).toBeInTheDocument();
    expect(panel().getByText("Rush yds")).toBeInTheDocument();
    expect(panel().getByText("Rec yds")).toBeInTheDocument();
  });

  it("renders the actual projected yardage, not just the labels", async () => {
    // The label-only version of this test passed with the render mutated to
    // `Math.round(market.yards * 2)` -- all 139 tests green against a number that
    // was wrong by 100%. Asserting the values is what makes the panel honest.
    const api = mockApi([qb("Lamar", 280), rb("Mark", 90), wr("Zay", 110)]);
    render(<GameDetailModal game={game} api={api} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lamar")).toBeInTheDocument());
    expect(panel().getByText("280")).toBeInTheDocument();
    expect(panel().getByText("90")).toBeInTheDocument();
    expect(panel().getByText("110")).toBeInTheDocument();
  });

  it("sums a market across players and shows how many contributed", async () => {
    const api = mockApi([qb("Lamar", 280), rb("Mark", 60), rb("Gus", 30), wr("Zay", 110)]);
    render(<GameDetailModal game={game} api={api} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Lamar")).toBeInTheDocument());
    // 60 + 30, and the box score's own RB totals row says 90 too. The count is
    // the block's alone: the box score prints a sum, never how many went into it.
    expect(panel().getByText("90")).toBeInTheDocument();
    expect(panel().getByText("(2)")).toBeInTheDocument();
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

  it("hides the panel entirely when a team has no yardage projection", async () => {
    // A kicker: no yardage market, and no position group in the box score
    // either, so nothing about this player renders a name anywhere. Since A4
    // removed the flat "Model Player Projections" list, there is no longer a
    // player name on the page to wait for -- the modal prints its no-modelled-
    // positions state instead, and that is what the wait below is for. The
    // assertion this test exists for is unchanged. The wording is matched
    // loosely on purpose: it is A4's, it is not this test's subject, and a
    // reword should not fail a test about the yardage block. (The first
    // alternative was "No players at this position", a sentence naming the
    // position filter A4 deleted; it was reworded, not the branch.)
    const api = mockApi([{ player_id: "p", player_name: "p", recent_team: "Ravens", position: "K", anytime_td_prob: 0.1 }]);
    render(<GameDetailModal game={game} api={api} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/No modelled positions for this game|No player projection props available/)).toBeInTheDocument());
    expect(screen.queryByText(/Projected Yardage/i)).not.toBeInTheDocument();
  });
});

