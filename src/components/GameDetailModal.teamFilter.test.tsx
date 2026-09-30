/** The Away/Both/Home team filter on the predicted box score (plan-a A4).
 *
 *  Contract under test:
 *  - the control sits on the box-score section's header line and defaults to Both;
 *  - Both groups callers' rows by team (away section, then home) then position;
 *  - Away / Home show only that team's players;
 *  - each visible team gets its total ONCE (not once per position group);
 *  - the old side-by-side "Projected Yardage by Market" cards are gone — the
 *    totals rows carry those numbers, so two encodings do not survive.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { GameDetailModal } from "./GameDetailModal";
import type { GameSummary, PlayerPropPrediction, SportApi } from "../types";

vi.mock("../context/SportContext", () => ({
  useSport: () => ({ sport: "nfl", setSport: () => {}, api: {} }),
}));

const game: GameSummary = {
  game_id: "2026_01_KC_BAL", season: 2026, week: 1, gameday: "2026-09-07T20:00:00Z",
  home_team: "Ravens", away_team: "Chiefs", home_score: null, away_score: null,
};

function prop(
  id: string, team: string, position = "WR", over: Partial<PlayerPropPrediction> = {},
): PlayerPropPrediction {
  return {
    player_id: id, player_name: id, recent_team: team, position,
    anytime_td_prob: 0.3, ...over,
  };
}

// Both teams, three modelled positions each, every yardage market projected so
// the team totals are real sums rather than refused cells.
const roster: PlayerPropPrediction[] = [
  prop("Mahomes", "Chiefs", "QB", { passing_yards: 290 }),
  prop("Rice", "Chiefs", "WR", { receiving_yards: 70, receptions: 5 }),
  prop("Pacheco", "Chiefs", "RB", { rushing_yards: 60, carries: 14 }),
  prop("Lamar", "Ravens", "QB", { passing_yards: 240 }),
  prop("Zay", "Ravens", "WR", { receiving_yards: 80, receptions: 6 }),
  prop("Henry", "Ravens", "RB", { rushing_yards: 90, carries: 18 }),
];

function mockApi(props: PlayerPropPrediction[]): SportApi {
  return {
    games: vi.fn(),
    gamePrediction: vi.fn().mockResolvedValue({
      home_win_prob: 0.6, away_win_prob: 0.4,
      home_cover_prob: null, away_cover_prob: null, over_prob: null, under_prob: null,
    }),
    playerProps: vi.fn().mockResolvedValue(props),
    trackRecord: vi.fn(), retrain: vi.fn(),
    gameVerdict: vi.fn().mockResolvedValue(null),
    predictionsForWeek: vi.fn(), currentWeek: vi.fn(),
    hubTeams: vi.fn(), hubPlayers: vi.fn(),
    standings: vi.fn(), powerRankings: vi.fn(), predictionsBatch: vi.fn(),
    teamForm: vi.fn().mockResolvedValue({ team: "", recent_form: [] }),
    headToHead: vi.fn().mockResolvedValue({ game_id: "", meetings: [] }),
    ...{},
  };
}

async function renderModal(props: PlayerPropPrediction[] = roster) {
  render(<GameDetailModal game={game} api={mockApi(props)} onClose={() => {}} />);
  // The filter control only renders with the box score, so waiting for it also
  // waits for the player props to have resolved.
  await screen.findByTestId("box-score-team-filter");
}

function teamTotals() {
  return within(screen.getByTestId("box-score-team-totals")).getAllByTestId("box-score-team-total");
}

describe("the box-score team filter", () => {
  it("defaults to Both, showing both teams grouped by team — away section first", async () => {
    await renderModal();
    expect(screen.getByRole("button", { name: "Both" })).toHaveAttribute("aria-pressed", "true");
    // Team sections, away then home like the scoreline above the modal.
    const sections = screen.getAllByTestId("box-score-team-section");
    expect(sections.map((s) => s.textContent)).toEqual(["Chiefs", "Ravens"]);
    // Both teams' players are on the page.
    expect(screen.getByText("Mahomes")).toBeInTheDocument();
    expect(screen.getByText("Lamar")).toBeInTheDocument();
  });

  it("Away shows the away team only, then re-groups back to Both", async () => {
    await renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Away" }));
    expect(screen.getByRole("button", { name: "Away" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByTestId("box-score-team-section").map((s) => s.textContent)).toEqual(["Chiefs"]);
    expect(screen.getByText("Mahomes")).toBeInTheDocument();
    expect(screen.queryByText("Lamar")).not.toBeInTheDocument();
    expect(teamTotals()).toHaveLength(1);
    expect(teamTotals()[0]).toHaveTextContent("Chiefs total");
    // And back: switching re-groups in place, nothing is lost.
    fireEvent.click(screen.getByRole("button", { name: "Both" }));
    expect(screen.getByText("Lamar")).toBeInTheDocument();
    expect(teamTotals()).toHaveLength(2);
  });

  it("Home shows the home team only", async () => {
    await renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(screen.getByRole("button", { name: "Home" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByTestId("box-score-team-section").map((s) => s.textContent)).toEqual(["Ravens"]);
    expect(screen.getByText("Lamar")).toBeInTheDocument();
    expect(screen.queryByText("Mahomes")).not.toBeInTheDocument();
    expect(teamTotals()).toHaveLength(1);
    expect(teamTotals()[0]).toHaveTextContent("Ravens total");
  });

  it("shows each team's total once, with that team's own per-market sums", async () => {
    await renderModal();
    const totals = teamTotals();
    expect(totals).toHaveLength(2);
    expect(totals[0]).toHaveTextContent("Chiefs total");
    expect(totals[0]).toHaveTextContent("290"); // pass
    expect(totals[0]).toHaveTextContent("60"); // rush
    expect(totals[0]).toHaveTextContent("70"); // receiving
    expect(totals[1]).toHaveTextContent("Ravens total");
    expect(totals[1]).toHaveTextContent("240");
    expect(totals[1]).toHaveTextContent("90");
    expect(totals[1]).toHaveTextContent("80");
    // Not once per position group: the per-position subtotal rows are gone, so
    // no second encoding of either total survives on the page.
    expect(screen.queryByTestId("box-score-subtotal")).not.toBeInTheDocument();
  });

  it("removes the duplicated side-by-side yardage cards", async () => {
    await renderModal();
    expect(screen.queryByTestId("yardage-by-market")).not.toBeInTheDocument();
    expect(screen.queryByText("Projected Yardage by Market")).not.toBeInTheDocument();
  });
});
