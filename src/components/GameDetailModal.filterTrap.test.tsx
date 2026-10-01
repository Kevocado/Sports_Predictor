/** The team filter must never be the thing that traps you.
 *
 *  Finding on #20: the Away/Both/Home control used to be gated on whether the
 *  CURRENT scope had rows. Press Away on a game whose away team has no
 *  projections and the control vanished — taking the only way back to Both
 *  with it. The filter's visibility is now a property of the GAME (does it have
 *  any player props at all), never of the scope currently selected, so an empty
 *  scope is a dead end you can walk back out of.
 *
 *  Under test:
 *  - an empty Away / Home scope still shows all three buttons;
 *  - the honest empty-state sentence is still on screen and still names the
 *    team it is about;
 *  - pressing Both brings the other team's rows back;
 *  - a game with no props at all has nothing to filter, so the control is
 *    hidden there (the fix is not "always show it").
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

const homeRoster: PlayerPropPrediction[] = [
  prop("Lamar", "Ravens", "QB", { passing_yards: 240 }),
  prop("Zay", "Ravens", "WR", { receiving_yards: 80, receptions: 6 }),
  prop("Henry", "Ravens", "RB", { rushing_yards: 90, carries: 18 }),
];

const awayRoster: PlayerPropPrediction[] = [
  prop("Mahomes", "Chiefs", "QB", { passing_yards: 290 }),
  prop("Rice", "Chiefs", "WR", { receiving_yards: 70, receptions: 5 }),
  prop("Pacheco", "Chiefs", "RB", { rushing_yards: 60, carries: 14 }),
];

function mockApi(props: PlayerPropPrediction[]): SportApi {
  return {
    games: vi.fn(),
    gamePrediction: vi.fn().mockResolvedValue({
      home_win_prob: 0.6, away_win_prob: 0.4,
      home_cover_prob: null, away_cover_prob: null, over_prob: null, under_prob: null,
    }),
    playerProps: vi.fn().mockResolvedValue(props),
    // Phase 2: the out list has its own route on NFL. Absent here means
    // "no check ran", which the panel words as such rather than as nobody being out.
    playerOut: vi.fn().mockResolvedValue([]),
    trackRecord: vi.fn(), retrain: vi.fn(),
    gameVerdict: vi.fn().mockResolvedValue(null),
    predictionsForWeek: vi.fn(), currentWeek: vi.fn(),
    hubTeams: vi.fn(), hubPlayers: vi.fn(),
    standings: vi.fn(), powerRankings: vi.fn(), predictionsBatch: vi.fn(),
    teamForm: vi.fn().mockResolvedValue({ team: "", recent_form: [] }),
    headToHead: vi.fn().mockResolvedValue({ game_id: "", meetings: [] }),
  };
}

async function renderModal(props: PlayerPropPrediction[]) {
  render(<GameDetailModal game={game} api={mockApi(props)} onClose={() => {}} />);
}

/** The three buttons, in order, or null when the control is not on screen. */
function filterButtonNames(): string[] | null {
  const group = screen.queryByTestId("box-score-team-filter");
  return group ? within(group).getAllByRole("button").map((b) => b.textContent ?? "") : null;
}

function press(label: string) {
  fireEvent.click(screen.getByRole("button", { name: label }));
}


// Phase 2 added the picks panel above the box score, and it names players too --
// so a page-wide `getByText("Lamar")` is now ambiguous. These assertions are
// about the BOX SCORE, so they are scoped to it rather than loosened to
// getAllByText (which would pass whether or not the box score kept the row).
function boxScore() {
  return within(screen.getByRole("region", { name: "Predicted box score" }));
}

describe("the team filter is never the way out of a dead end", () => {
  it("keeps the filter on screen in an empty Away scope, and Both brings the rows back", async () => {
    // Only the home team has projections: pressing Away lands on a scope with
    // nothing in it.
    await renderModal(homeRoster);
    await boxScore().findByText("Lamar");
    expect(filterButtonNames()).toEqual(["Away", "Both", "Home"]);

    press("Away");
    expect(screen.getByRole("button", { name: "Away" })).toHaveAttribute("aria-pressed", "true");
    // The scope really is empty, and the empty state says so honestly, naming
    // the team it is about.
    expect(boxScore().queryByText("Lamar")).not.toBeInTheDocument();
    expect(screen.getByText(/No Chiefs player projections for this game yet\./)).toBeInTheDocument();
    // The way out is still on screen — this is the trap, so assert it loudly.
    expect(
      filterButtonNames(),
      "the filter is the only way back to Both, so it must not disappear on an empty scope",
    ).toEqual(["Away", "Both", "Home"]);

    // And the way out works: the home rows are back.
    press("Both");
    expect(screen.getByRole("button", { name: "Both" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByTestId("box-score-team-section").map((s) => s.textContent)).toEqual(["Ravens"]);
    expect(boxScore().getByText("Lamar")).toBeInTheDocument();
    expect(boxScore().getByText("Zay")).toBeInTheDocument();
    expect(boxScore().getByText("Henry")).toBeInTheDocument();
  });

  it("keeps the filter on screen in an empty Home scope too", async () => {
    // Mirror image: away projections only, so Home is the empty scope.
    await renderModal(awayRoster);
    await boxScore().findByText("Mahomes");

    press("Home");
    expect(boxScore().queryByText("Mahomes")).not.toBeInTheDocument();
    expect(screen.getByText(/No Ravens player projections for this game yet\./)).toBeInTheDocument();
    expect(
      filterButtonNames(),
      "an empty Home scope must not take the control with it",
    ).toEqual(["Away", "Both", "Home"]);

    press("Both");
    expect(boxScore().getByText("Mahomes")).toBeInTheDocument();
    expect(screen.getAllByTestId("box-score-team-section").map((s) => s.textContent)).toEqual(["Chiefs"]);
  });

  it("still hides the filter for a game with no player props at all", async () => {
    // Nothing to filter means nothing to switch between: the control stays
    // hidden and the honest game-level sentence carries the empty state.
    await renderModal([]);
    await screen.findByText(/No player projection props available for this specific game yet\./);
    expect(filterButtonNames()).toBeNull();
  });
});
