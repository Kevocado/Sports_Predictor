import type {
  CurrentWeek,
  GamePrediction,
  GameSummary,
  GameVerdict,
  HeadToHead,
  PlayerPropPrediction,
  PowerRankingsResponse,
  RetrainResponse,
  SportApi,
  StandingsEntry,
  TeamForm,
  TrackRecord,
  WeekPrediction,
} from "../types";

export function createApiClient(baseUrl: string): SportApi {
  const cleanBase = baseUrl.replace(/\/+$/, "");

  // 45s TTL promise cache for GETs. Closure-local per client, so the NFL
  // and CFB clients never share entries even for identical relative paths.
  // Caching the promise (not the payload) also dedupes in-flight requests.
  const TTL_MS = 45_000;
  const cache = new Map<string, { promise: Promise<unknown>; expiresAt: number }>();

  function cached<T>(path: string, fetcher: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = cache.get(path);
    if (hit && hit.expiresAt > now) return hit.promise as Promise<T>;
    const promise = fetcher();
    // A rejected request must not poison the cache.
    promise.catch(() => {
      if (cache.get(path)?.promise === promise) cache.delete(path);
    });
    cache.set(path, { promise, expiresAt: now + TTL_MS });
    return promise;
  }

  async function get<T>(path: string): Promise<T> {
    return cached(path, async () => {
      const res = await fetch(`${cleanBase}${path}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `${res.status} ${res.statusText}`);
      }
      return res.json();
    });
  }

  async function getOrNull<T>(path: string): Promise<T | null> {
    return cached(path, async () => {
      const res = await fetch(`${cleanBase}${path}`);
      if (res.status === 404) return null;
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `${res.status} ${res.statusText}`);
      }
      return res.json();
    });
  }

  async function post<T>(path: string): Promise<T> {
    const res = await fetch(`${cleanBase}${path}`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail ?? `${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  return {
    games: (season, week) => get<GameSummary[]>(`/games?season=${season}&week=${week}`),
    gamePrediction: (season, week, gameId) =>
      get<GamePrediction>(`/games/${season}/${week}/${gameId}/prediction`),
    playerProps: (season, week) => get<PlayerPropPrediction[]>(`/players/${season}/${week}/props`),
    trackRecord: () => get<TrackRecord>("/track-record"),
    retrain: () => post<RetrainResponse>("/retrain"),
    gameVerdict: (gameId) => getOrNull<GameVerdict>(`/games/${gameId}/verdict`),
    predictionsForWeek: (season, week) => get<WeekPrediction[]>(`/predictions/${season}/${week}`),
    currentWeek: () => get<CurrentWeek>("/current-week"),
    standings: (season) => get<StandingsEntry[]>(`/standings?season=${season}`),
    powerRankings: (season) => get<PowerRankingsResponse>(`/power-rankings?season=${season}`),
    predictionsBatch: (season, week) =>
      get<Record<string, GamePrediction>>(`/predictions/${season}/${week}/batch`),
    teamForm: (team, season, n = 5) =>
      get<TeamForm>(`/teams/${encodeURIComponent(team)}/form?season=${season}&n=${n}`),
    headToHead: (gameId, season, week, nSeasons = 8) =>
      get<HeadToHead>(`/games/${gameId}/head-to-head?season=${season}&week=${week}&n_seasons=${nSeasons}`),
  };
}

// DYNAMIC RESOLUTION: If running on the Azure production frontend domain, 
// automatically point directly to the respective backend FQDNs. Otherwise, use local dev ports.
const isProd = window.location.hostname.includes("azurecontainerapps.io");

const NFL_BASE_URL = isProd
  ? "https://nfl-predictor.proudbay-f56b8dfa.eastus2.azurecontainerapps.io/api"
  : "http://localhost:8001/api";

const CFB_BASE_URL = isProd
  ? "https://cfb-predictor.proudbay-f56b8dfa.eastus2.azurecontainerapps.io/api"
  : "http://localhost:8003/api";

export const nflApi = createApiClient(NFL_BASE_URL);
export const cfbApi = createApiClient(CFB_BASE_URL);

/**
 * Best-effort warm of both sport clients: current week first, then the main
 * endpoints in parallel (each call is behind the client's 45s TTL cache).
 * Fire-and-forget from the app shell shortly after first paint.
 */
export async function preloadAll(): Promise<void> {
  for (const api of [nflApi, cfbApi]) {
    try {
      const cw = await api.currentWeek();
      await Promise.allSettled([
        api.games(cw.season, cw.week),
        api.predictionsBatch(cw.season, cw.week),
        api.playerProps(cw.season, cw.week),
        api.standings(cw.season),
        api.trackRecord(),
        api.powerRankings(cw.season),
      ]);
    } catch {
      // Preload is best-effort; pages fetch for themselves on demand.
    }
  }
}
