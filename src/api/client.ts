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

// A backend that accepts the connection but never answers must still end in
// the page's error state (with Try again), never an endless "Loading…".
export const REQUEST_TIMEOUT_MS = 15_000;

function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export function createApiClient(baseUrl: string): SportApi {
  const cleanBase = baseUrl.replace(/\/+$/, "");

  // 10-minute TTL promise cache for GETs. Closure-local per client, so the
  // NFL and CFB clients never share entries even for identical relative
  // paths. Caching the promise (not the payload) also dedupes in-flight
  // requests. 10 minutes (not 45s) because these endpoints change slowly --
  // a short TTL made every tab revisit / sport switch re-fire the whole
  // request chain against the backends.
  const TTL_MS = 10 * 60_000;
  // current-week only flips when the calendar moves to a new week.
  const CURRENT_WEEK_TTL_MS = 60 * 60_000;
  const cache = new Map<string, { promise: Promise<unknown>; expiresAt: number }>();

  function cached<T>(path: string, fetcher: () => Promise<T>, ttlMs: number = TTL_MS): Promise<T> {
    const now = Date.now();
    const hit = cache.get(path);
    if (hit && hit.expiresAt > now) return hit.promise as Promise<T>;
    const promise = fetcher();
    // A rejected request must not poison the cache.
    promise.catch(() => {
      if (cache.get(path)?.promise === promise) cache.delete(path);
    });
    cache.set(path, { promise, expiresAt: now + ttlMs });
    return promise;
  }

  async function get<T>(path: string, ttlMs: number = TTL_MS): Promise<T> {
    return cached(path, async () => {
      const res = await fetchWithTimeout(`${cleanBase}${path}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? `${res.status} ${res.statusText}`);
      }
      return res.json();
    }, ttlMs);
  }

  async function getOrNull<T>(path: string): Promise<T | null> {
    return cached(path, async () => {
      const res = await fetchWithTimeout(`${cleanBase}${path}`);
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
    currentWeek: () => get<CurrentWeek>("/current-week", CURRENT_WEEK_TTL_MS),
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

// Same-origin by default: the Caddy in front of this site (see Caddyfile)
// and the Vite dev/preview server (vite.config.ts) both proxy these paths
// to the NFL and CFB APIs. Override per build with VITE_NFL_API_BASE_URL /
// VITE_CFB_API_BASE_URL only when the APIs live on another origin.
export const NFL_BASE_URL: string = import.meta.env.VITE_NFL_API_BASE_URL ?? "/api/nfl";
export const CFB_BASE_URL: string = import.meta.env.VITE_CFB_API_BASE_URL ?? "/api/cfb";

export const nflApi = createApiClient(NFL_BASE_URL);
export const cfbApi = createApiClient(CFB_BASE_URL);

/**
 * Best-effort warm of both sport clients: current week first, then the main
 * endpoints in parallel (each call is behind the client's TTL cache).
 * Fire-and-forget from the app shell shortly after first paint, and again
 * whenever the tab becomes visible (device wakeup / tab switch back).
 */
export async function preloadAll(): Promise<void> {
  async function warmSport(api: SportApi): Promise<void> {
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
  // Warm both sports concurrently: the old sequential loop doubled the time
  // before the second sport's tabs stopped hanging on cold navigation.
  await Promise.allSettled([warmSport(nflApi), warmSport(cfbApi)]);
}
