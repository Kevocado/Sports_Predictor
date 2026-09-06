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

// Relative paths by default -- proxied by Caddy in production (see Caddyfile's
// handle_path /nfl/* and /cfb/* blocks, which strip the prefix before forwarding
// to each internal Container App) and by Vite's own dev-server proxy locally
// (see vite.config.ts's server.proxy). Confirmed live: defaulting to a literal
// http://localhost:*/api here meant the built bundle baked in localhost URLs
// whenever VITE_NFL_API_BASE_URL/VITE_CFB_API_BASE_URL weren't set at build
// time -- which they never were, so the deployed production bundle tried to
// reach a real user's own machine instead of the actual backends.
const NFL_BASE_URL = import.meta.env.VITE_NFL_API_BASE_URL ?? "/nfl/api";
const CFB_BASE_URL = import.meta.env.VITE_CFB_API_BASE_URL ?? "/cfb/api";

export const nflApi = createApiClient(NFL_BASE_URL);
export const cfbApi = createApiClient(CFB_BASE_URL);
