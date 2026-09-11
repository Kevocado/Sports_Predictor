import type {
  CurrentWeek,
  GamePrediction,
  GameSummary,
  GameVerdict,
  PlayerPropPrediction,
  RetrainResponse,
  SportApi,
  StandingsEntry,
  TrackRecord,
  WeekPrediction,
} from "../types";

export function createApiClient(baseUrl: string): SportApi {
  const cleanBase = baseUrl.replace(/\/+$/, "");

  async function get<T>(path: string): Promise<T> {
    const res = await fetch(`${cleanBase}${path}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail ?? `${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  async function getOrNull<T>(path: string): Promise<T | null> {
    const res = await fetch(`${cleanBase}${path}`);
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail ?? `${res.status} ${res.statusText}`);
    }
    return res.json();
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