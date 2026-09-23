import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { mergeTeamRows, TeamHubPage } from "./TeamHubPage";
import type { FormEntry, SportApi, StandingsEntry, TeamRanking } from "../types";

const rankings: TeamRanking[] = [
  { team: "KC", rating: 1612.4, rank: 1, wins: 8, losses: 1, ties: 0, conference: "AFC", division: "AFC West" },
  { team: "BUF", rating: 1590.1, rank: 2, wins: 7, losses: 2, ties: 0, conference: "AFC", division: "AFC East" },
  { team: "LV", rating: 1450.5, rank: 25, wins: 2, losses: 7, ties: 0, conference: "AFC", division: "AFC West" },
  { team: "OAK", rating: 1400.0, rank: 26, wins: 0, losses: 0, ties: 0, conference: "AFC", division: "AFC West" },
];

function standing(team: string, pointDiff: number, projWins: number): StandingsEntry {
  return {
    team, conference: "AFC", division: "AFC West", played: 9,
    wins: 8, losses: 1, ties: 0, point_diff: pointDiff,
    projected_wins: projWins, projected_losses: 17 - projWins, projected_point_diff: pointDiff + 40,
    current_division_rank: 1, projected_division_rank: 1, division_rank_delta: 0,
  };
}
const standings: StandingsEntry[] = [standing("KC", 87, 12.4), standing("BUF", 45, 11.1), standing("LV", -60, 4.2)];

function mockApi(): SportApi {
  return {
    games: vi.fn(), gamePrediction: vi.fn(), playerProps: vi.fn(), trackRecord: vi.fn(),
    retrain: vi.fn(), gameVerdict: vi.fn(), predictionsForWeek: vi.fn(),
    currentWeek: vi.fn(), standings: vi.fn().mockResolvedValue(standings),
    powerRankings: vi.fn().mockResolvedValue({ season: 2026, rankings }),
    predictionsBatch: vi.fn(), teamForm: vi.fn(), headToHead: vi.fn(),
  };
}

describe("mergeTeamRows", () => {
  it("joins standings fields onto each ranked team", () => {
    const rows = mergeTeamRows(rankings, standings);
    const kc = rows.find((r) => r.team === "KC")!;
    expect(kc.rank).toBe(1);
    expect(kc.rating).toBe(1612.4);
    expect(kc.pointDiff).toBe(87);
    expect(kc.projectedWins).toBe(12.4);
    expect(kc.rankDelta).toBe(0);
  });

  it("drops the stale OAK duplicate when LV is present", () => {
    const rows = mergeTeamRows(rankings, standings);
    expect(rows.some((r) => r.team === "OAK")).toBe(false);
    expect(rows.some((r) => r.team === "LV")).toBe(true);
  });

  it("keeps OAK when LV is absent so real data is never hidden", () => {
    const rows = mergeTeamRows(rankings.filter((r) => r.team !== "LV"), standings);
    expect(rows.some((r) => r.team === "OAK")).toBe(true);
  });

  it("keeps ranked teams that have no standings row yet", () => {
    const rows = mergeTeamRows(
      [{ team: "NEW", rating: 1500, rank: 30, wins: 0, losses: 0, ties: 0 }],
      [],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].pointDiff).toBeUndefined();
  });

  it("carries the recent-form string through mergeTeamRows", () => {
    const rows = mergeTeamRows(
      [{ team: "KC", rating: 1600, rank: 1, wins: 8, losses: 1, ties: 0, recent_form: "WWLWW" }],
      [],
    );
    expect(rows[0].form).toBe("WWLWW");
  });
});

describe("TeamHubPage", () => {
  it("loads rankings and standings, then renders one row per team with logo and rating", async () => {
    const api = mockApi();
    render(<TeamHubPage api={api} season={2026} sport="nfl" />);

    expect(api.powerRankings).toHaveBeenCalledWith(2026);
    expect(api.standings).toHaveBeenCalledWith(2026);
    await waitFor(() => expect(screen.getByText("KC")).toBeInTheDocument());
    expect(screen.getByAltText("KC logo")).toBeInTheDocument();
    expect(screen.getByText("1612")).toBeInTheDocument();
    // OAK is dropped as a stale duplicate of LV
    expect(screen.queryByText("OAK")).not.toBeInTheDocument();
    expect(screen.getByText("LV")).toBeInTheDocument();
  });

  it("filters teams by search text", async () => {
    const api = mockApi();
    render(<TeamHubPage api={api} season={2026} sport="nfl" />);
    await waitFor(() => expect(screen.getByText("BUF")).toBeInTheDocument());

    fireEvent.change(screen.getByPlaceholderText(/search teams/i), { target: { value: "buf" } });
    expect(screen.getByText("BUF")).toBeInTheDocument();
    expect(screen.queryByText("KC")).not.toBeInTheDocument();
  });

  it("expands a row to show last-5 form fetched lazily", async () => {
    const form: FormEntry[] = [
      { game_id: "g1", opponent: "BUF", is_home: true, result: "W", team_score: 27, opponent_score: 24, gameday: "2026-09-13" },
      { game_id: "g2", opponent: "DEN", is_home: false, result: "L", team_score: 17, opponent_score: 20, gameday: "2026-09-20" },
    ];
    const api = mockApi();
    vi.mocked(api.teamForm).mockResolvedValue({ team: "KC", recent_form: form });
    render(<TeamHubPage api={api} season={2026} sport="nfl" />);
    await waitFor(() => expect(screen.getByText("BUF")).toBeInTheDocument());

    expect(api.teamForm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /KC/i }));
    await waitFor(() => expect(api.teamForm).toHaveBeenCalledWith("KC", 2026, 5));
    const expanded = screen.getByTestId("team-form-KC");
    expect(within(expanded).getByText("W")).toBeInTheDocument();
    expect(within(expanded).getByText("L")).toBeInTheDocument();
    expect(within(expanded).getByText(/27-24/)).toBeInTheDocument();
  });

  it("renders recent-form chips inline without expanding the row", async () => {
    const api = mockApi();
    api.powerRankings = vi.fn().mockResolvedValue({
      season: 2026,
      rankings: [
        { team: "KC", rating: 1612.4, rank: 1, wins: 8, losses: 1, ties: 0, recent_form: "WWLWT" },
      ],
    });
    render(<TeamHubPage api={api} season={2026} sport="nfl" />);
    await waitFor(() => expect(screen.getByText("KC")).toBeInTheDocument());

    const chips = within(screen.getByTestId("team-form-chips-KC"));
    expect(chips.getAllByText("W")).toHaveLength(3);
    expect(chips.getAllByText("L")).toHaveLength(1);
    expect(chips.getAllByText("T")).toHaveLength(1);
    // no extra fetch: the string came with the rankings payload
    expect(api.teamForm).not.toHaveBeenCalled();
  });

  it("sorts by rating when the rating header is clicked", async () => {
    const api = mockApi();
    render(<TeamHubPage api={api} season={2026} sport="nfl" />);
    await waitFor(() => expect(screen.getByText("BUF")).toBeInTheDocument());

    const rows = () => within(screen.getByTestId("team-hub-rows")).getAllByTestId(/team-hub-row-/);
    // default: rank order
    expect(rows()[0]).toHaveAttribute("data-team", "KC");
    fireEvent.click(screen.getByRole("button", { name: /^rating/i }));
    // best rating first
    expect(rows()[0]).toHaveAttribute("data-team", "KC");
    expect(rows()[2]).toHaveAttribute("data-team", "LV");
    fireEvent.click(screen.getByRole("button", { name: /^rating/i }));
    // toggles to ascending
    expect(rows()[0]).toHaveAttribute("data-team", "LV");
  });
});
