import type {
  GamePrediction,
  GameSummary,
  PlayerPropPrediction,
  RetrainResponse,
  SportApi,
  TrackRecord,
} from "../types";

export function createApiClient(baseUrl: string): SportApi {
  async function get<T>(path: string): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail ?? `${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  async function post<T>(path: string): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, { method: "POST" });
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

const NFL_BASE_URL = import.meta.env.VITE_NFL_API_BASE_URL ?? "http://localhost:8001/api";
const CFB_BASE_URL = import.meta.env.VITE_CFB_API_BASE_URL ?? "http://localhost:8003/api";

export const nflApi = createApiClient(NFL_BASE_URL);
export const cfbApi = createApiClient(CFB_BASE_URL);
