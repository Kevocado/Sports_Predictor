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
// The yardage/count markets are whatever POSITION_MARKETS has for that
// position, so they are optional and a missing one stays missing (an em-dash),
// never 0. `is_starter` is true/false from NFL's depth chart and null where no
// depth chart exists -- CFB has none, and NFL's live payload does not carry
// the field yet. Absent is "unknown", not "not a starter".
export interface PlayerPropPrediction { player_id: string; player_name: string; recent_team: string; position: string; anytime_td_prob: number; passing_yards?: number; rushing_yards?: number; receiving_yards?: number; carries?: number; receptions?: number; is_starter?: boolean | null; depth_slot?: number | null; }
// ---------------------------------------------------------------------------
// Track record (B6)
//
// These are transcribed from what the trackers EMIT, not from the design spec's
// data contract, and the two do not fully agree. Read
// NFL_Predictor/src/nfl_predictor/tracking/store.py::get_track_record and
// _summarize_games before changing anything here -- the spec is a description,
// that function is the contract.
//
// Where they differ, the emitter wins and the difference is named:
//
//  - The spec's `WeeklyRow` carries `pct_total_error`, `total_mae` and
//    `total_bias`. B4 did NOT put them there. Every week of every points
//    forecast lives in its own `totals`/`margin` block with its own `weekly`
//    list, and the field is called `signed_error`, not `bias`. So `WeeklyRow`
//    has none of the three.
//  - The spec's `totals: { n, mae, bias, weekly }` is emitted as
//    `{ n, mae, signed_error, weekly }`.
//  - `weekly_trend` is GONE (B3) and is not kept alongside `weekly` for
//    compatibility. Two shapes for one fact is how this page shipped a
//    `types.ts` that read `{bucket, n_resolved}` against an API emitting
//    `{label, n}`, and rendered a section that had never once appeared in any
//    deploy. The CFB backend is still on the old key -- see the optionality
//    note below.
//
// The new keys are OPTIONAL, and that is not hedging. CFB_Predictor has not
// had B2-B5 applied to it: its `/track-record` still emits `weekly_trend`, no
// per-market counts, no points forecasts and no `vs_market`. This one site
// serves both sports off `?sport=`, so making these required would take the
// CFB tab from "behind" to "throws", which is the failure B6 exists to end.
// A section whose data the payload does not carry renders a visible
// not-recorded state on the page, which is the same rule the backend applies
// to a week with no picks.
// ---------------------------------------------------------------------------

/** One elapsed week. Every week 1..current has a row, tracked or not (B3). */
export interface WeeklyRow {
  week: number;
  /** false = no picks recorded that week. Its rates are absent, not zero. */
  tracked: boolean;
  /** Volume. Never multiplied into an accuracy -- see the B2 bar fix. */
  n_games: number;
  n_moneyline: number;
  pct_moneyline_correct: number | null;
  n_ats: number;
  pct_ats_correct: number | null;
  n_totals: number;
  pct_totals_correct: number | null;
}

/** One week of a points forecast: the model's total or margin, in points. */
export interface PointForecastWeek {
  week: number;
  /** false = no pick that week had a points forecast recorded. */
  tracked: boolean;
  n: number;
  mae: number | null;
  signed_error: number | null;
}

/**
 * MAE and signed error for one points forecast, overall and by week (B4).
 * `signed_error` is mean(predicted - actual): positive over-forecast.
 */
export interface PointForecast {
  n: number;
  mae: number | null;
  signed_error: number | null;
  weekly: PointForecastWeek[];
}

/** The words B5 ships with the numbers, so the page cannot forget to print them. */
export interface VsMarketMethod {
  sigma_league_points: number;
  sigma_league_meaning: string;
  implied_probability: string;
  edge: string;
  disagreement: string;
  not_a_profit_claim: string;
}

/** One week of the model-against-the-line comparison. */
export interface VsMarketWeek {
  week: number;
  tracked: boolean;
  n: number;
  mean_implied_home_cover_prob: number | null;
  mean_model_home_cover_prob: number | null;
  mean_edge_points: number | null;
  disagreement_n: number;
  disagreement_hit_rate: number | null;
  games: string[];
}

/**
 * The model against the price (B5). "Edge" is a disagreement between two
 * probabilities in percentage points -- it is never a return, a stake or a
 * cent, and PRODUCT.md forbids reading it as one.
 */
export interface VsMarket {
  n: number;
  mean_implied_home_cover_prob: number | null;
  mean_model_home_cover_prob: number | null;
  mean_edge_points: number | null;
  disagreement_n: number;
  disagreement_hit_rate: number | null;
  /** The cohort as its own object, so `games` cannot read as "every game". */
  disagreement: { n: number; hit_rate: number | null; games: string[] };
  weekly: VsMarketWeek[];
  method: VsMarketMethod;
}

export interface GamesTrackRecord {
  n_resolved: number;
  // Picks rebuilt after kickoff: reported, never counted. Absent from older API builds.
  n_rebuilt?: number;
  pct_moneyline_correct: number | null;
  pct_ats_correct: number | null;
  pct_totals_correct: number | null;
  // The denominator behind each accuracy above (B2). They differ: a market is
  // only graded when its line and both its probabilities were recorded.
  n_moneyline?: number;
  n_ats?: number;
  n_totals?: number;
  /** Every elapsed week, tracked or not. Replaces `weekly_trend` (B3). */
  weekly?: WeeklyRow[];
  /** Predicted total points, in points. */
  totals?: PointForecast;
  /** Predicted margin, in points. */
  margin?: PointForecast;
  vs_market?: VsMarket;
}
export interface ConfidenceBucket { label: string; n: number; hit_rate: number | null; }
export interface AnytimeTdTrackRecord {
  n_resolved: number;
  // Absent, not 0, when nothing resolved: there is no such thing as zero calls
  // on a week with no props in it.
  n_called?: number;
  hit_rate_when_called: number | null;
  brier_score: number | null;
  confidence_buckets?: ConfidenceBucket[];
}
/** One position's error inside a yardage market. */
export interface PositionMaeRow { position: string; n_resolved: number; mean_absolute_error: number | null; }
export interface YardageTrackRecord {
  n_resolved: number; mean_absolute_error: number | null;
  mean_signed_error: number | null;
  /** NFL's shape: a list, with the count beside every position's error. */
  by_position?: PositionMaeRow[];
  /** CFB's shape: a bare map, with no count beside a position's error. */
  mae_by_position?: Record<string, number>;
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
// Data Hub season tables (/hub/teams, /hub/players). Per-game and rate
// fields are null when a team or player has no games yet, or when the
// advanced feed is down: the UI shows a dash, never a zero.
export interface HubRecentGame {
  gameday: string;
  opponent: string;
  is_home: boolean;
  team_score: number;
  opponent_score: number;
  result: "W" | "L" | "T";
}
export interface HubTeam {
  team: string;
  games: number;
  wins: number;
  losses: number;
  ties: number;
  points_for_pg: number | null;
  points_against_pg: number | null;
  off_epa_play: number | null;
  def_epa_play: number | null;
  off_success_rate: number | null;
  def_success_rate: number | null;
  yards_per_play: number | null;
  pass_rate: number | null;
  turnover_margin: number | null;
  streak: number;
  /** Oldest first, last five. */
  form: ("W" | "L" | "T")[];
  form_trend: "up" | "down" | "steady" | "new";
  /** Newest first, last five. */
  recent_games: HubRecentGame[];
}
export interface HubTeamsResponse {
  season: number;
  teams: HubTeam[];
  /** CFB only: false while the advanced feed is unavailable. */
  advanced_available?: boolean;
}
export interface HubPlayer {
  player_id: string;
  name: string;
  team: string;
  position: string;
  games: number;
  completions: number;
  attempts: number;
  passing_yards: number;
  passing_tds: number;
  interceptions: number;
  carries: number;
  rushing_yards: number;
  rushing_tds: number;
  receptions: number;
  targets: number;
  receiving_yards: number;
  receiving_tds: number;
  /** NFL: EPA summed over the season. CFB: PPA, the same idea. */
  epa_total: number | null;
  target_share: number | null;
  air_yards_share: number | null;
  fantasy_ppr_pg: number | null;
}
export interface HubPlayersResponse {
  season: number;
  players: HubPlayer[];
  leaderboards: Record<string, HubPlayer[]>;
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
  hubTeams: (season: number) => Promise<HubTeamsResponse>;
  hubPlayers: (season: number) => Promise<HubPlayersResponse>;
}
