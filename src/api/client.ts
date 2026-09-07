import type {
  GamePrediction,
  GameSummary,
  PlayerPropPrediction,
  RetrainResponse,
  SportApi,
  TrackRecord,
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
  };
}

// Updated absolute URLs - build timestamp: 2026-09-07
const NFL_BASE_URL = "https://nfl-predictor.proudbay-f56b8dfa.eastus2.azurecontainerapps.io/api";
const CFB_BASE_URL = "https://cfb-predictor.proudbay-f56b8dfa.eastus2.azurecontainerapps.io/api";

export const nflApi = createApiClient(NFL_BASE_URL);
export const cfbApi = createApiClient(CFB_BASE_URL);