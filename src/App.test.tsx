import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";
import type { SportApi } from "./types";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);
function okJson(data: unknown) { return { ok: true, status: 200, json: () => Promise.resolve(data) }; }

const api = {
  currentWeek: vi.fn(async () => ({ season: 2026, week: 7 })),
  games: vi.fn(async () => []),
  predictionsBatch: vi.fn(async () => ({})),
  playerProps: vi.fn(async () => []),
  standings: vi.fn(async () => []),
  trackRecord: vi.fn(async () => ({
    games: { n_resolved: 0, pct_moneyline_correct: null, pct_ats_correct: null, pct_totals_correct: null, weekly_trend: [] },
    player_props: {
      anytime_td: { n_resolved: 0, hit_rate_when_called: null, brier_score: null },
      passing_yards: { n_resolved: 0, mean_absolute_error: null },
      rushing_yards: { n_resolved: 0, mean_absolute_error: null },
      receiving_yards: { n_resolved: 0, mean_absolute_error: null },
    },
  })),
  powerRankings: vi.fn(async () => ({ season: 2026, rankings: [] })),
  gamePrediction: vi.fn(), gameVerdict: vi.fn(), predictionsForWeek: vi.fn(),
  retrain: vi.fn(), teamForm: vi.fn(), headToHead: vi.fn(),
} as unknown as SportApi;

vi.mock("./context/SportContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./context/SportContext")>();
  return { ...actual, useSport: () => ({ sport: "nfl", setSport: () => {}, api }) };
});

describe("App tab shell", () => {
  it("keeps visited tabs mounted and hides inactive ones instead of unmounting", async () => {
    render(<App />);
    expect(await screen.findByText("No games scheduled for this week.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hub" }));
    // The Hub opens on its Player Hub sub-tab.
    expect(await screen.findByText("No player predictions available for this week yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Team Hub" })).toBeInTheDocument();
    // Games tab content is still in the document, just hidden.
    expect(screen.getByText("No games scheduled for this week.")).toBeInTheDocument();
    expect(document.querySelector('[data-tab="games"]')).toHaveStyle("display: none");
    expect(document.querySelector('[data-tab="hub"]')).not.toHaveStyle("display: none");
  });

  it("starts the cross-sport preload shortly after first paint", async () => {
    vi.useFakeTimers();
    try {
      fetchMock.mockReset();
      fetchMock.mockImplementation((url: string) =>
        String(url).endsWith("/current-week")
          ? Promise.resolve(okJson({ season: 2026, week: 7 }))
          : Promise.resolve(okJson([])),
      );
      render(<App />);
      // Nothing preloaded before the delay.
      expect(fetchMock).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000);
      // Let the preload's promise chain settle.
      for (let i = 0; i < 20; i++) await Promise.resolve();
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls).toContain("http://localhost:8001/api/current-week");
      expect(urls).toContain("http://localhost:8003/api/current-week");
    } finally {
      vi.useRealTimers();
    }
  });

  it("re-warms both sports in the background when the tab becomes visible again", async () => {
    vi.useFakeTimers();
    const visibilityDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
    try {
      fetchMock.mockReset();
      fetchMock.mockImplementation((url: string) =>
        String(url).endsWith("/current-week")
          ? Promise.resolve(okJson({ season: 2026, week: 7 }))
          : Promise.resolve(okJson([])),
      );
      render(<App />);
      await vi.advanceTimersByTimeAsync(1000);
      for (let i = 0; i < 20; i++) await Promise.resolve();
      // Let the warm cache expire, as it would after the device slept.
      // 61 minutes also expires current-week (1-hour TTL).
      await vi.advanceTimersByTimeAsync(61 * 60_000);
      fetchMock.mockClear();
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
      for (let i = 0; i < 50; i++) await Promise.resolve();
      const urls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(urls).toContain("http://localhost:8001/api/current-week");
      expect(urls).toContain("http://localhost:8003/api/current-week");
      expect(urls).toContain("http://localhost:8001/api/predictions/2026/7/batch");
      expect(urls).toContain("http://localhost:8003/api/predictions/2026/7/batch");
    } finally {
      if (visibilityDescriptor) Object.defineProperty(document, "visibilityState", visibilityDescriptor);
      vi.useRealTimers();
    }
  });
});
