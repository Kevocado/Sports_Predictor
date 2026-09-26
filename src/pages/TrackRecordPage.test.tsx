import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrackRecordPage } from "./TrackRecordPage";
import type { SportApi } from "../types";

const trackRecord = vi.fn(async () => ({
  games: {
    n_resolved: 12, n_rebuilt: 3, pct_moneyline_correct: 0.667, pct_ats_correct: 0.5, pct_totals_correct: 0.417,
    weekly_trend: [{ week: 7, pct_moneyline_correct: 0.667, n_games: 12 }],
  },
  player_props: {
    anytime_td: { n_resolved: 30, hit_rate_when_called: 0.6, brier_score: 0.18, n_called: 20 },
    passing_yards: { n_resolved: 40, mean_absolute_error: 32.4 },
    rushing_yards: { n_resolved: 40, mean_absolute_error: 18.1 },
    receiving_yards: { n_resolved: 40, mean_absolute_error: 21.7 },
  },
}));
const api = {
  trackRecord,
  games: vi.fn(), gamePrediction: vi.fn(), playerProps: vi.fn(),
  retrain: vi.fn(), gameVerdict: vi.fn(), predictionsForWeek: vi.fn(),
  currentWeek: vi.fn(), standings: vi.fn(), powerRankings: vi.fn(),
  predictionsBatch: vi.fn(), teamForm: vi.fn(), headToHead: vi.fn(),
} as unknown as SportApi;

vi.mock("../context/SportContext", () => ({
  useSport: () => ({ sport: "nfl", setSport: () => {}, api }),
}));

describe("TrackRecordPage", () => {
  it("marks the 50% break-even point on accuracy cards", async () => {
    const { container } = render(<TrackRecordPage />);
    expect(await screen.findByText("Moneyline accuracy")).toBeInTheDocument();

    const markers = container.querySelectorAll("[data-testid='accuracy-50-marker']");
    // moneyline, ATS, totals, anytime-TD
    expect(markers.length).toBe(4);

    const bars = container.querySelectorAll("[data-testid='accuracy-bar'] > span:first-child");
    expect(bars[0]).toHaveStyle({ width: "67%" });
  });

  it("says how many rebuilt picks it left out of the record", async () => {
    render(<TrackRecordPage />);
    expect(await screen.findByText("3 picks rebuilt after kickoff are shown on their games but not counted here.")).toBeInTheDocument();
  });
});
