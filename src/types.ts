export type Sport = "nfl" | "cfb";
export interface GameSummary {
  game_id: string;
  season: number;
  week: number;
  gameday: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  spread_line?: number | null;
  total_line?: number | null;
  home_total_yards?: number;
  home_passing_yards?: number;
  home_rushing_yards?: number;
  away_total_yards?: number;
  away_passing_yards?: number;
  away_rushing_yards?: number;
  home_conference?: string | null;
  away_conference?: string | null;
  // NFL-only context the /games endpoint already returns (schedules.py
  // KEEP_COLUMNS): rest days, roof/surface, weather, divisional flag. CFB
  // responses simply omit these, so everything is optional.
  home_rest?: number | null;
  away_rest?: number | null;
  roof?: string | null;
  surface?: string | null;
  temp?: number | null;
  wind?: number | null;
  div_game?: boolean | null;
}
export interface GamePrediction { home_win_prob: number; away_win_prob: number; home_cover_prob: number | null; away_cover_prob: number | null; over_prob: number | null; under_prob: number | null; predicted_margin?: number; predicted_total?: number; sigma?: number; total_sigma?: number; }
export interface PlayerPropPrediction { player_id: string; player_name: string; recent_team: string; position: string; anytime_td_prob: number; passing_yards?: number; rushing_yards?: number; receiving_yards?: number; carries?: number; receptions?: number; }
export interface WeeklyTrendEntry { week: number; pct_moneyline_correct: number; n_games: number; }
export interface GamesTrackRecord {
  n_resolved: number;
  pct_moneyline_correct: number | null;
  pct_ats_correct: number | null;
  pct_totals_correct: number | null;
  weekly_trend: WeeklyTrendEntry[];
}
export interface ConfidenceBucket { label: string; n: number; hit_rate: number | null; }
export interface AnytimeTdTrackRecord {
  n_resolved: number; n_called?: number; hit_rate_when_called: number | null; brier_score: number | null;
  confidence_buckets?: ConfidenceBucket[];
}
export interface YardageTrackRecord {
  n_resolved: number; mean_absolute_error: number | null;
  mean_signed_error?: number | null; mae_by_position?: Record<string, number>;
}
export interface PlayerPropsTrackRecord {
  anytime_td: AnytimeTdTrackRecord;
  passing_yards: YardageTrackRecord;
  rushing_yards: YardageTrackRecord;
  receiving_yards: YardageTrackRecord;
  receptions?: YardageTrackRecord;
  carries?: YardageTrackRecord;
}
export interface TrackRecord { games: GamesTrackRecord; player_props: PlayerPropsTrackRecord; }
export interface RetrainResponse { trained_at: string; chosen_candidate: string; }
export interface MarketVerdict { hit: boolean; predicted: string; actual?: string; }
export interface GameVerdict { game_id: string; resolved: boolean; moneyline: MarketVerdict; ats: MarketVerdict | null; totals: MarketVerdict | null; actual_home_score?: number; actual_away_score?: number; home_spread_line?: number | null; total_line?: number | null; }
export type WeekPredictionStatus = "untracked" | "pending" | "resolved";
// rebuilt: snapshotted at or after kickoff (a backfill), so shown but never
// counted as a pre-kickoff call. Absent from older API builds.
export interface WeekPrediction { game_id: string; status: WeekPredictionStatus; rebuilt?: boolean; home_win_prob?: number; away_win_prob?: number; verdict: GameVerdict | null; }
export interface CurrentWeek { season: number; week: number; }
// NFL groups by division (current_division_rank/...), CFB has no fixed
// divisions and groups by conference alone (current_conference_rank/...) --
// a row only ever has one set of rank fields populated, matching whichever
// sport it came from.
export interface StandingsEntry {
  team: string;
  conference: string | null;
  division?: string | null;
  played: number;
  wins: number;
  losses: number;
  ties: number;
  point_diff: number;
  projected_wins: number;
  projected_losses: number;
  projected_point_diff: number;
  current_division_rank?: number;
  projected_division_rank?: number;
  division_rank_delta?: number;
  current_conference_rank?: number;
  projected_conference_rank?: number;
  conference_rank_delta?: number;
}
export interface TeamRanking {
  team: string;
  rating: number;
  rank: number;
  wins: number;
  losses: number;
  ties: number;
  recent_form?: string | null;
  conference?: string | null;
  division?: string | null;
}
export interface PowerRankingsResponse {
  season: number;
  rankings: TeamRanking[];
}
export interface FormEntry {
  game_id: string;
  opponent: string;
  is_home: boolean;
  result: "W" | "L" | "T";
  team_score: number;
  opponent_score: number;
  gameday: string;
}
export interface TeamForm {
  team: string;
  recent_form: FormEntry[];
}
export interface HeadToHeadMeeting {
  game_id: string;
  season: number;
  gameday: string;
  home_team: string;
  away_team: string;
  home_score: number;
  away_score: number;
}
export interface HeadToHead {
  game_id: string;
  meetings: HeadToHeadMeeting[];
}
export interface SportApi {
  games: (season: number, week: number) => Promise<GameSummary[]>;
  gamePrediction: (season: number, week: number, gameId: string) => Promise<GamePrediction>;
  playerProps: (season: number, week: number) => Promise<PlayerPropPrediction[]>;
  trackRecord: () => Promise<TrackRecord>;
  retrain: () => Promise<RetrainResponse>;
  gameVerdict: (gameId: string) => Promise<GameVerdict | null>;
  predictionsForWeek: (season: number, week: number) => Promise<WeekPrediction[]>;
  currentWeek: () => Promise<CurrentWeek>;
  standings: (season: number) => Promise<StandingsEntry[]>;
  powerRankings: (season: number) => Promise<PowerRankingsResponse>;
  predictionsBatch: (season: number, week: number) => Promise<Record<string, GamePrediction>>;
  teamForm: (team: string, season: number, n?: number) => Promise<TeamForm>;
  headToHead: (gameId: string, season: number, week: number, nSeasons?: number) => Promise<HeadToHead>;
}
