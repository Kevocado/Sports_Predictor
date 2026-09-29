import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { PlayersPage } from "./PlayersPage";
import type { HubPlayer, PlayerPropPrediction, SportApi } from "../types";

function player(id: string, name: string, position: string, epa: number | null, extra: Partial<HubPlayer> = {}): HubPlayer {
  return {
    player_id: id, name, team: "KC", position, games: 5,
    completions: 0, attempts: 0, passing_yards: 0, passing_tds: 0, interceptions: 0,
    carries: 0, rushing_yards: 0, rushing_tds: 0, receptions: 0, targets: 0,
    receiving_yards: 0, receiving_tds: 0,
    epa_total: epa, target_share: null, air_yards_share: null, fantasy_ppr_pg: null,
    ...extra,
  };
}

const qbs = [
  player("qb1", "Patrick Mahomes", "QB", 42.5, { passing_yards: 1510, passing_tds: 12, interceptions: 3 }),
  player("qb2", "Josh Allen", "QB", 38.1, { team: "BUF", passing_yards: 1402 }),
  player("qb3", "Lamar Jackson", "QB", 30.0, { team: "BAL" }),
  player("qb4", "Joe Burrow", "QB", 20.0, { team: "CIN" }),
  player("qb5", "Jalen Hurts", "QB", 12.0, { team: "PHI" }),
  player("qb6", "Bo Nix", "QB", -4.0, { team: "DEN" }),
];
const wr = player("wr1", "Tyreek Hill", "WR", 18.2, { team: "MIA", targets: 51, target_share: 0.281, receiving_yards: 620, receiving_tds: 4 });
const players = [...qbs, wr];
const leaderboards = { QB: qbs.slice(0, 5), RB: [], WR: [wr], TE: [] };

const props: PlayerPropPrediction[] = [
  { player_id: "qb1", player_name: "Patrick Mahomes", recent_team: "KC", position: "QB", anytime_td_prob: 0.3, passing_yards: 281.4 },
];

const api = {
  currentWeek: vi.fn().mockResolvedValue({ season: 2026, week: 7 }),
  hubPlayers: vi.fn().mockResolvedValue({ season: 2026, players, leaderboards }),
  playerProps: vi.fn().mockResolvedValue(props),
} as unknown as SportApi;

const sportState = { sport: "nfl" };
vi.mock("../context/SportContext", () => ({
  useSport: () => ({ sport: sportState.sport, setSport: () => {}, api }),
}));

const table = () => screen.getByRole("table");
const headers = () => within(table()).getAllByRole("columnheader").map((h) => h.textContent ?? "");

describe("PlayersPage", () => {
  it("loads the season's players for the sport's current season and week", async () => {
    render(<PlayersPage />);
    await screen.findByRole("table");
    expect(api.hubPlayers).toHaveBeenCalledWith(2026);
    expect(api.playerProps).toHaveBeenCalledWith(2026, 7);
  });

  it("shows only quarterbacks under QB, with passing columns", async () => {
    render(<PlayersPage />);
    await screen.findByRole("table");
    for (const label of ["Pass yds", "Pass TD", "INT", "EPA"]) expect(headers().some((h) => h.startsWith(label))).toBe(true);
    expect(within(table()).getByText("Patrick Mahomes")).toBeInTheDocument();
    expect(within(table()).queryByText("Tyreek Hill")).not.toBeInTheDocument();
  });

  it("switches to receiver columns under WR", async () => {
    render(<PlayersPage />);
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "WR" }));
    for (const label of ["Targets", "Target share", "Rec yds", "Rec TD", "EPA"]) expect(headers().some((h) => h.startsWith(label))).toBe(true);
    expect(within(table()).getByText("Tyreek Hill")).toBeInTheDocument();
    expect(within(table()).getByText("28%")).toBeInTheDocument();
    expect(within(table()).queryByText("Patrick Mahomes")).not.toBeInTheDocument();
  });

  it("lists the position's top 5 by EPA", async () => {
    render(<PlayersPage />);
    const board = await screen.findByRole("list", { name: /EPA leaders/i });
    const names = within(board).getAllByRole("listitem").map((li) => li.textContent);
    expect(names).toHaveLength(5);
    expect(names[0]).toContain("Patrick Mahomes");
    expect(names.join(" ")).not.toContain("Bo Nix");
  });

  it("shows this week's projection when the model has one, and a dash otherwise", async () => {
    render(<PlayersPage />);
    await screen.findByRole("table");
    expect(headers().some((h) => h.startsWith("Projected this week"))).toBe(true);
    const mahomes = within(table()).getByText("Patrick Mahomes").closest("tr")!;
    expect(within(mahomes).getByText("281")).toBeInTheDocument();
    const allen = within(table()).getByText("Josh Allen").closest("tr")!;
    const cells = within(allen).getAllByRole("cell");
    expect(cells[cells.length - 1].textContent).toBe("—");
  });

  it("narrows by name search", async () => {
    render(<PlayersPage />);
    await screen.findByRole("table");
    fireEvent.change(screen.getByRole("searchbox", { name: /search players/i }), { target: { value: "allen" } });
    expect(within(table()).getByText("Josh Allen")).toBeInTheDocument();
    expect(within(table()).queryByText("Patrick Mahomes")).not.toBeInTheDocument();
  });

  it("clears the previous sport's players while the new sport loads", async () => {
    const { rerender } = render(<PlayersPage />);
    await screen.findByRole("table");
    let release: (v: { season: number; week: number }) => void = () => {};
    vi.mocked(api.currentWeek).mockReturnValueOnce(new Promise((r) => { release = r; }));
    sportState.sport = "cfb";
    rerender(<PlayersPage />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    release({ season: 2026, week: 7 });
    expect(await screen.findByRole("table")).toBeInTheDocument();
    sportState.sport = "nfl";
  });
});
