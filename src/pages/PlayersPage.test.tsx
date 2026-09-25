import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PlayersPage } from "./PlayersPage";
import type { PlayerPropPrediction, SportApi } from "../types";

function qb(id: string, name: string, yards: number, team = "KC"): PlayerPropPrediction {
  return { player_id: id, player_name: name, recent_team: team, position: "QB", anytime_td_prob: 0.3, passing_yards: yards };
}

const props: PlayerPropPrediction[] = [
  qb("qb1", "Patrick Mahomes", 320),
  qb("qb2", "Josh Allen", 280, "BUF"),
  qb("qb3", "Lamar Jackson", 250, "BAL"),
  qb("qb4", "Joe Burrow", 200, "CIN"),
  // Placeholder rows the CFB feed sometimes emits must never surface as "top players".
  qb("qb0", "Team", 400, "KC"),
  { player_id: "rb1", player_name: "Saquon Barkley", recent_team: "PHI", position: "RB", anytime_td_prob: 0.55, rushing_yards: 110 },
];

const playerProps = vi.fn().mockResolvedValue(props);
const currentWeek = vi.fn().mockResolvedValue({ season: 2026, week: 7 });
const api: SportApi = {
  games: vi.fn(), gamePrediction: vi.fn(), playerProps, trackRecord: vi.fn(),
  retrain: vi.fn(), gameVerdict: vi.fn(), predictionsForWeek: vi.fn(),
  currentWeek, standings: vi.fn(), powerRankings: vi.fn(),
  predictionsBatch: vi.fn(), teamForm: vi.fn(), headToHead: vi.fn(),
};

vi.mock("../context/SportContext", () => ({
  useSport: () => ({ sport: "nfl", setSport: () => {}, api }),
}));

describe("PlayersPage", () => {
  it("fetches props for the sport's actual current week, not a hardcoded season/week", async () => {
    render(<PlayersPage />);

    await waitFor(() => expect(playerProps).toHaveBeenCalledWith(2026, 7));
    expect(await screen.findByText(/week 7 top players/i)).toBeInTheDocument();
  });

  it("spotlights the top 3 players per position, best first", async () => {
    render(<PlayersPage />);
    await waitFor(() => expect(screen.getByTestId("spotlight-QB")).toBeInTheDocument());

    const card = screen.getByTestId("spotlight-QB");
    const names = within(card).getAllByTestId(/spotlight-QB-player-/).map((el) => el.textContent);
    expect(names[0]).toMatch(/Patrick Mahomes/);
    expect(names[1]).toMatch(/Josh Allen/);
    expect(names[2]).toMatch(/Lamar Jackson/);
    expect(within(card).queryByText(/Joe Burrow/)).not.toBeInTheDocument();
    // #1 shows the projected stat and the team logo
    expect(within(card).getByText("320")).toBeInTheDocument();
    expect(within(card).getByAltText("KC logo")).toBeInTheDocument();
  });

  it("never surfaces placeholder 'Team' rows as top players", async () => {
    render(<PlayersPage />);
    await waitFor(() => expect(screen.getByTestId("spotlight-QB")).toBeInTheDocument());

    // The 400-yard "Team" placeholder would outrank everyone if not filtered.
    expect(screen.queryByTestId("spotlight-QB-player-qb0")).not.toBeInTheDocument();
    expect(screen.queryAllByText("Team")).toHaveLength(0);
  });

  it("keeps the full ranked list below the spotlight and filters it by search", async () => {
    render(<PlayersPage />);
    // Burrow renders in the spotlight and the list; wait for either, with room
    // for a loaded test run (the default 1s raced the full suite).
    await screen.findAllByText("Joe Burrow", {}, { timeout: 5000 });

    fireEvent.change(screen.getByPlaceholderText(/search player/i), { target: { value: "burrow" } });
    // Burrow appears in both the spotlight card and the full list.
    expect(screen.getAllByText("Joe Burrow").length).toBeGreaterThan(0);
    expect(screen.queryByText("Patrick Mahomes")).not.toBeInTheDocument();
  });

  it("does not use betting language in the heading", async () => {
    render(<PlayersPage />);
    await waitFor(() => expect(screen.getByText(/week 7 top players/i)).toBeInTheDocument());
    expect(screen.queryByText(/best bets/i)).not.toBeInTheDocument();
  });
});
