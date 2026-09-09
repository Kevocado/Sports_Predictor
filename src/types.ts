export type Sport = "nfl" | "cfb";
export interface GameSummary { game_id: string; season: number; week: number; gameday: string; home_team: string; away_team: string; home_score: number | null; away_score: number | null; spread_line?: number | null; total_line?: number | null; }
export interface GamePrediction { home_win_prob: number; away_win_prob: number; home_cover_prob: number | null; away_cover_prob: number | null; over_prob: number | null; under_prob: number | null; }
export interface PlayerPropPrediction { player_id: string; player_name: string; recent_team: string; position: string; anytime_td_prob: number; passing_yards?: number; rushing_yards?: number; receiving_yards?: number; }
export interface TrackRecord { n_resolved_games: number; pct_moneyline_correct: number | null; }
export interface RetrainResponse { trained_at: string; chosen_candidate: string; }
export interface MarketVerdict { hit: boolean; predicted: string; actual?: string; }
export interface GameVerdict { game_id: string; resolved: boolean; moneyline: MarketVerdict; ats: MarketVerdict | null; totals: MarketVerdict | null; }
export type WeekPredictionStatus = "untracked" | "pending" | "resolved";
export interface WeekPrediction { game_id: string; status: WeekPredictionStatus; home_win_prob?: number; away_win_prob?: number; verdict: GameVerdict | null; }
export interface SportApi { games: (season: number, week: number) => Promise<GameSummary[]>; gamePrediction: (season: number, week: number, gameId: string) => Promise<GamePrediction>; playerProps: (season: number, week: number) => Promise<PlayerPropPrediction[]>; trackRecord: () => Promise<TrackRecord>; retrain: () => Promise<RetrainResponse>; gameVerdict: (gameId: string) => Promise<GameVerdict | null>; predictionsForWeek: (season: number, week: number) => Promise<WeekPrediction[]>; }
