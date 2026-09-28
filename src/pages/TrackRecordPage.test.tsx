import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { TrackRecordPage } from "./TrackRecordPage";
import type { SportApi } from "../types";

const trackRecord = vi.fn(async () => ({
  games: {
    n_resolved: 12, n_rebuilt: 3, pct_moneyline_correct: 0.667, pct_ats_correct: 0.5, pct_totals_correct: 0.417,
    n_moneyline: 12, n_ats: 10, n_totals: 6,
    weekly: [{ week: 7, tracked: true, n_games: 12, n_moneyline: 12, pct_moneyline_correct: 0.667, n_ats: 10, pct_ats_correct: 0.5, n_totals: 6, pct_totals_correct: 0.417 }],
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

  // --- B2: volume and accuracy are two questions, two encodings ------------
  //
  // The fixture is B2's own arithmetic: week 1 is four games at 50%, week 2 is
  // ONE game, won. The fused formula `(n_games / max_games) * pct * 100` drew
  // week 2 at 25% -- a quarter of the track for a perfect week, and a claim
  // about a game nobody can make from one game. The unfused bar draws it at
  // 100% and prints the 1 game beside it as text.
  //
  // `n_games: 1` is deliberate: with a volume share multiplied back in, the
  // width here collapses to 25% and this assertion fails. It is the whole test.
  it("draws a week bar on the accuracy scale alone, and the game count as text", async () => {
    trackRecord.mockResolvedValueOnce({
      games: {
        n_resolved: 5, n_rebuilt: 0, n_moneyline: 5, n_ats: 5, n_totals: 5,
        pct_moneyline_correct: 0.8, pct_ats_correct: 0.6, pct_totals_correct: 0.4,
        weekly: [
          { week: 1, tracked: true, n_games: 4, n_moneyline: 4, pct_moneyline_correct: 0.5, n_ats: 4, pct_ats_correct: 0.5, n_totals: 4, pct_totals_correct: 0.5 },
          { week: 2, tracked: true, n_games: 1, n_moneyline: 1, pct_moneyline_correct: 1.0, n_ats: 1, pct_ats_correct: 1.0, n_totals: 1, pct_totals_correct: 1.0 },
        ],
      },
      player_props: {
        anytime_td: { n_resolved: 0, hit_rate_when_called: null, brier_score: null },
        passing_yards: { n_resolved: 0, mean_absolute_error: null },
        rushing_yards: { n_resolved: 0, mean_absolute_error: null },
        receiving_yards: { n_resolved: 0, mean_absolute_error: null },
      },
    } as never);

    const { container } = render(<TrackRecordPage />);
    expect(await screen.findByText("Week 1")).toBeInTheDocument();

    const bars = container.querySelectorAll(".rounded-full.bg-sp-gold");
    // The four headline cards come first, then the two week bars. The week 2
    // bar is the LAST one, and it is the one the fused formula got wrong.
    const fills = [...bars].map((b) => (b as HTMLElement).style.width);
    expect(fills.slice(-2)).toEqual(["50%", "100%"]);

    // And the volume is a number in its own right, not a factor of the bar.
    expect(screen.getByText("100% (1)")).toBeInTheDocument();
    expect(screen.getByText("50% (4)")).toBeInTheDocument();
  });

  // The other half of the guard. Widths alone would still pass if a future
  // session reintroduced the volume share under a different name, so the
  // formula itself is asserted absent from the page's CODE. Comments are
  // stripped first, because the reason the formula is wrong belongs in a
  // comment and must not itself trip the guard.
  it("never multiplies a volume share into an accuracy anywhere in the page", async () => {
    const source = readFileSync(resolve(__dirname, "TrackRecordPage.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(source).not.toMatch(/max_games/);
    expect(source).not.toMatch(/n_games\s*\/[^\n]*\*/);
    // The one thing that may touch n_games is rendering it.
    expect(source).toMatch(/n_games/);
  });
});
