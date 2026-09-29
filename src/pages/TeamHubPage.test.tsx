import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { TeamHubPage } from "./TeamHubPage";
import type { HubTeam, HubTeamsResponse, SportApi } from "../types";

const kc: HubTeam = {
  team: "KC", games: 5, wins: 4, losses: 1, ties: 0,
  points_for_pg: 27.4, points_against_pg: 19.2,
  off_epa_play: 0.123, def_epa_play: -0.051,
  off_success_rate: 0.482, def_success_rate: 0.41,
  yards_per_play: 6.1, pass_rate: 0.6, turnover_margin: 3,
  streak: 2, form: ["W", "L", "W", "W", "W"], form_trend: "up",
  recent_games: [
    { gameday: "2026-10-11", opponent: "BAL", is_home: true, team_score: 27, opponent_score: 20, result: "W" },
    { gameday: "2026-10-04", opponent: "DEN", is_home: false, team_score: 17, opponent_score: 20, result: "L" },
  ],
};
const expansion: HubTeam = {
  team: "NEW", games: 0, wins: 0, losses: 0, ties: 0,
  points_for_pg: null, points_against_pg: null,
  off_epa_play: null, def_epa_play: null, off_success_rate: null, def_success_rate: null,
  yards_per_play: null, pass_rate: null, turnover_margin: null,
  streak: 0, form: [], form_trend: "new", recent_games: [],
};

function mockApi(res: HubTeamsResponse): SportApi {
  return { hubTeams: vi.fn().mockResolvedValue(res) } as unknown as SportApi;
}

describe("TeamHubPage", () => {
  it("shows every team with the advanced columns, EPA signed", async () => {
    const api = mockApi({ season: 2026, teams: [kc, expansion] });
    render(<TeamHubPage api={api} season={2026} sport="nfl" />);
    expect(await screen.findByText("+0.12")).toBeInTheDocument();
    expect(api.hubTeams).toHaveBeenCalledWith(2026);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    for (const label of ["Team", "Record", "Off EPA/play", "Def EPA/play", "Success rate", "Pts for/g", "Pts against/g", "Turnovers ±", "Form"]) {
      expect(headers.some((h) => h?.startsWith(label))).toBe(true);
    }
    expect(screen.getByText("−0.05")).toBeInTheDocument();
    expect(screen.getByText("48%")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
  });

  it("gives a team with no games dashes and 'New this season', never zeros", async () => {
    render(<TeamHubPage api={mockApi({ season: 2026, teams: [kc, expansion] })} season={2026} sport="nfl" />);
    await screen.findByText("+0.12");
    const row = screen.getByRole("button", { name: "Show NEW details" }).closest("tr")!;
    expect(within(row).getByText("New this season")).toBeInTheDocument();
    expect(within(row).getAllByText("—").length).toBeGreaterThanOrEqual(6);
    expect(within(row).queryByText("0.0")).not.toBeInTheDocument();
  });

  it("expands a team into its recent games, newest first", async () => {
    render(<TeamHubPage api={mockApi({ season: 2026, teams: [kc, expansion] })} season={2026} sport="nfl" />);
    fireEvent.click(await screen.findByRole("button", { name: "Show KC details" }));
    const games = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(games[0]).toContain("W 27–20 v BAL");
    expect(games[1]).toContain("L 17–20 at DEN");
  });

  it("says so and hides the EPA columns when advanced stats are unavailable", async () => {
    render(<TeamHubPage api={mockApi({ season: 2026, teams: [kc], advanced_available: false })} season={2026} sport="cfb" />);
    expect(await screen.findByText(/Advanced stats unavailable right now/)).toBeInTheDocument();
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent ?? "");
    expect(headers.some((h) => h.includes("EPA"))).toBe(false);
    expect(headers.some((h) => h.startsWith("Record"))).toBe(true);
  });

  it("offers Try again when the request fails", async () => {
    const api = { hubTeams: vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue({ season: 2026, teams: [kc] }) } as unknown as SportApi;
    render(<TeamHubPage api={api} season={2026} sport="nfl" />);
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("+0.12")).toBeInTheDocument();
  });

  it("treats an empty payload (a failed snapshot build) as no stats yet, not a crash", async () => {
    render(<TeamHubPage api={{ hubTeams: vi.fn().mockResolvedValue({}) } as unknown as SportApi} season={2026} sport="nfl" />);
    expect(await screen.findByText("No team stats for 2026 yet.")).toBeInTheDocument();
  });

  it("puts the stingiest defense first on the first click, sorted ascending", async () => {
    const stingy = { ...kc, team: "BAL", def_epa_play: -0.2 };
    render(<TeamHubPage api={mockApi({ season: 2026, teams: [kc, stingy] })} season={2026} sport="nfl" />);
    fireEvent.click(await screen.findByRole("button", { name: /^Def EPA\/play/ }));
    expect(screen.getByRole("columnheader", { name: /Def EPA/ })).toHaveAttribute("aria-sort", "ascending");
    expect(screen.getAllByRole("button", { name: /^Show .* details$/ })[0]).toHaveAccessibleName("Show BAL details");
  });
});
