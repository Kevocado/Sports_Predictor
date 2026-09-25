import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GameCard } from "./GameCard";
import type { GamePrediction, GameSummary } from "../types";

vi.mock("../context/SportContext", () => ({
  useSport: () => ({ sport: "nfl", setSport: () => {}, api: {} }),
}));

const game: GameSummary = { game_id: "2026_01_KC_BAL", season: 2026, week: 1, gameday: "2026-09-07T20:00:00Z", home_team: "Ravens", away_team: "Chiefs", home_score: null, away_score: null, spread_line: -2.5, total_line: 46.5 };
const prediction: GamePrediction = { home_win_prob: 0.62, away_win_prob: 0.38, home_cover_prob: 0.55, away_cover_prob: 0.45, over_prob: 0.5, under_prob: 0.5 };

describe("GameCard", () => {
  it("renders both team names and the confidence badge", () => {
    render(<GameCard game={game} prediction={prediction} onClick={() => {}} />);
    expect(screen.getAllByText("Ravens").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Chiefs").length).toBeGreaterThan(0);
    expect(screen.getByText("62% confident")).toBeInTheDocument();
  });
  it("shows a named loading state while predictions are still loading", () => {
    render(<GameCard game={game} prediction={null} onClick={() => {}} />);
    expect(screen.getByText("Loading pick…")).toBeInTheDocument();
  });
  it("says there is no pick, instead of loading forever, once predictions have settled", () => {
    render(<GameCard game={game} prediction={null} predictionsSettled onClick={() => {}} />);
    expect(screen.getByText("No pick yet")).toBeInTheDocument();
    expect(screen.queryByText(/Loading/)).not.toBeInTheDocument();
  });
  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<GameCard game={game} prediction={prediction} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });
  it("omits spread/total when undefined (CFB shape)", () => {
    const cfbGame: GameSummary = { ...game, spread_line: undefined, total_line: undefined };
    render(<GameCard game={cfbGame} prediction={prediction} onClick={() => {}} />);
    expect(screen.queryByText(/Spread/)).not.toBeInTheDocument();
  });
  it("shows an NFL-only weather/rest line when the fields are present", () => {
    const nflGame: GameSummary = { ...game, temp: 72, wind: 8, home_rest: 7, away_rest: 6, roof: "outdoors", div_game: true };
    render(<GameCard game={nflGame} prediction={prediction} onClick={() => {}} />);
    expect(screen.getByText("72°F · 8 mph wind · outdoors · rest 6d/7d (a/h) · divisional")).toBeInTheDocument();
  });
  it("omits the weather/rest line when the fields are absent (CFB shape)", () => {
    render(<GameCard game={game} prediction={prediction} onClick={() => {}} />);
    expect(screen.queryByText(/°F/)).not.toBeInTheDocument();
    expect(screen.queryByText(/mph wind/)).not.toBeInTheDocument();
  });
});
