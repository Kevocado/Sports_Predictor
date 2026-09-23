import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient, preloadAll } from "./client";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function okJson(data: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(data) };
}

describe("createApiClient new endpoints", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(okJson({}));
  });

  it("powerRankings hits /power-rankings with the season", async () => {
    const api = createApiClient("https://example.test/api/");
    await api.powerRankings(2026);
    expect(fetchMock).toHaveBeenCalledWith("https://example.test/api/power-rankings?season=2026");
  });

  it("predictionsBatch hits the batch route for the season and week", async () => {
    const api = createApiClient("https://example.test/api/");
    await api.predictionsBatch(2026, 7);
    expect(fetchMock).toHaveBeenCalledWith("https://example.test/api/predictions/2026/7/batch");
  });

  it("teamForm hits /teams/{team}/form with season and n, URL-encoding the team", async () => {
    const api = createApiClient("https://example.test/api/");
    await api.teamForm("Ohio State", 2026);
    expect(fetchMock).toHaveBeenCalledWith("https://example.test/api/teams/Ohio%20State/form?season=2026&n=5");
  });

  it("headToHead hits /games/{id}/head-to-head with season, week and n_seasons", async () => {
    const api = createApiClient("https://example.test/api/");
    await api.headToHead("2026_01_KC_BAL", 2026, 1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/api/games/2026_01_KC_BAL/head-to-head?season=2026&week=1&n_seasons=8",
    );
  });
});

describe("createApiClient TTL cache", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(okJson([]));
  });

  it("dedupes concurrent and repeated GETs within the 45s TTL", async () => {
    vi.useFakeTimers();
    try {
      const api = createApiClient("https://example.test/api/");
      const p1 = api.games(2026, 1);
      const p2 = api.games(2026, 1);
      await p1; await p2;
      expect(fetchMock).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(44_000);
      await api.games(2026, 1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(2_000); // past the TTL
      await api.games(2026, 1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not share cache entries between clients (NFL vs CFB isolation)", async () => {
    const nfl = createApiClient("https://nfl.test/api");
    const cfb = createApiClient("https://cfb.test/api");
    await nfl.games(2026, 1);
    await cfb.games(2026, 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(1, "https://nfl.test/api/games?season=2026&week=1");
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://cfb.test/api/games?season=2026&week=1");
  });

  it("does not cache rejected requests", async () => {
    fetchMock.mockRejectedValueOnce(new Error("down"));
    const api = createApiClient("https://example.test/api/");
    await expect(api.games(2026, 1)).rejects.toThrow("down");
    await api.games(2026, 1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("preloadAll", () => {
  it("warms current-week then the main endpoints for both sports", async () => {
    fetchMock.mockReset();
    fetchMock.mockImplementation((url: string) =>
      String(url).endsWith("/current-week")
        ? Promise.resolve(okJson({ season: 2026, week: 7 }))
        : Promise.resolve(okJson([])),
    );
    await preloadAll();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain("http://localhost:8001/api/current-week");
    expect(urls).toContain("http://localhost:8003/api/current-week");
    expect(urls).toContain("http://localhost:8001/api/predictions/2026/7/batch");
    expect(urls).toContain("http://localhost:8003/api/predictions/2026/7/batch");
    expect(urls).toContain("http://localhost:8001/api/power-rankings?season=2026");
    expect(urls).toContain("http://localhost:8003/api/power-rankings?season=2026");
  });
});
