import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrackRecordPage } from "./TrackRecordPage";
import type { SportApi, TrackRecord } from "../types";

/** Typed against `TrackRecord` so the NULLABLE fields are in the mock's
 *  signature. Inferred from the first implementation, this mock's return type
 *  had `pct_moneyline_correct: number`, so the empty-season case below — which
 *  the API really does return, and which `types.ts` declares as `number | null` —
 *  did not type-check. Casting the payload would have hidden that; declaring the
 *  mock's own type puts the nullability where the test can use it. */
const trackRecord = vi.fn<() => Promise<TrackRecord>>(async () => ({
  games: {
    n_resolved: 12, n_rebuilt: 3, pct_moneyline_correct: 0.667, pct_ats_correct: 0.5, pct_totals_correct: 0.417,
    weekly_trend: [{ week: 7, pct_moneyline_correct: 0.667, n_games: 12 }],
  },
  player_props: {
    anytime_td: { n_resolved: 30, hit_rate_when_called: 0.6, brier_score: 0.18, n_called: 20,
      confidence_buckets: [
        { label: "50-60%", n: 1, hit_rate: 1.0 },
        { label: "60-70%", n: 0, hit_rate: null },
        { label: "70%+", n: 0, hit_rate: null },
      ]
    },
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

  it("renders the Anytime-TD calibration section when confidence buckets have calls", async () => {
    render(<TrackRecordPage />);
    expect(await screen.findByText("Anytime-TD hit rate by confidence")).toBeInTheDocument();
    expect(screen.getByText("50-60%")).toBeInTheDocument();
  });

  it("does not render the Anytime-TD calibration section when confidence buckets are empty", async () => {
    trackRecord.mockReturnValueOnce(Promise.resolve({
      games: { n_resolved: 0, n_rebuilt: 0, pct_moneyline_correct: null, pct_ats_correct: null, pct_totals_correct: null, weekly_trend: [] },
      player_props: {
        anytime_td: { n_resolved: 0, hit_rate_when_called: null, brier_score: null, n_called: 0, confidence_buckets: [] },
        passing_yards: { n_resolved: 0, mean_absolute_error: null },
        rushing_yards: { n_resolved: 0, mean_absolute_error: null },
        receiving_yards: { n_resolved: 0, mean_absolute_error: null },
      },
    }));
    render(<TrackRecordPage />);
    expect(await screen.findByText("No resolved player props yet — check back once this week's games are final.")).toBeInTheDocument();
  });
});
