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
// `predicted_margin` and `predicted_total` are `number | null`, not `number`:
// the API sends `null` for an absent forecast, and pydantic 2.13.5 serialises
// NaN to `null`, so a widening here is a fix and not a loosening -- a caller
// that narrows it back would re-introduce the type error the wire format
// already avoids. (Taken from origin/v2-wire; the B6 track-record contract
// below is ours.)
export interface GamePrediction { home_win_prob: number; away_win_prob: number; home_cover_prob: number | null; away_cover_prob: number | null; over_prob: number | null; under_prob: number | null; predicted_margin?: number | null; predicted_total?: number | null; sigma?: number; total_sigma?: number; }
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

/**
 * The words B5 ships with the numbers, so the page cannot forget to print them.
 *
 * The index signature is load-bearing, not laziness. The tracker ADDS keys to
 * this block — `population` arrived after the other six — and the page renders
 * it by enumerating whatever it is sent. A type that closed the set would let
 * the next key compile while the page quietly stopped printing it, which is
 * exactly what happened: the page had a hand-written five-entry list, the
 * tracker added a sixth, and the sixth reached nobody. The declared keys below
 * are the ones the page gives a written heading to; anything else renders
 * under a heading derived from its own name rather than being dropped.
 *
 * `sigma_league_points` is the one NUMERIC value in the block. σ is a width and
 * "13.5" explains nothing on its own, so the page prints it as a number and
 * prints the sentence beside it.
 */
export interface VsMarketMethod {
  sigma_league_points: number;
  sigma_league_meaning: string;
  implied_probability: string;
  edge: string;
  disagreement: string;
  not_a_profit_claim: string;
  population: string;
  [key: string]: string | number | undefined;
}

/**
 * Which games the `vs_market` headline covers, and which its week chart does.
 *
 * The two are computed over DIFFERENT populations on purpose: the headline is
 * the whole record (so that it agrees with `n_resolved` and the ATS count two
 * keys above it), and the chart is one season's elapsed weeks. The tracker
 * computes the split rather than leaving it to be discovered, and the identity
 * `n_games_total == n_games_in_weekly + n_games_outside_weekly` is what makes
 * the block auditable.
 *
 * Optional only because the deployed backend can be older than this branch —
 * a missing block must degrade to no note, never to a throw. It is not
 * optional in the emitter.
 */
export interface VsMarketScope {
  /** The population label the headline is over, e.g. "all_seasons". */
  population: string;
  /** The season the week chart is scoped to; null when nothing names one. */
  weekly_season: number | null;
  /** The last week the chart covers; null when the calendar does not say. */
  weekly_last_week: number | null;
  n_games_total: number;
  n_games_in_weekly: number;
  n_games_outside_weekly: number;
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
  /** Absent from a backend older than B5's scope block. See VsMarketScope. */
  scope?: VsMarketScope;
}

// ---------------------------------------------------------------------------
// What the other side of this merge contributed to this file, and why.
//
// origin/v2-wire declared `WeeklyTrendEntry` and changed nothing above it that
// ours needed. `WeeklyTrendEntry` is NOT taken: B3 removed `weekly_trend` from
// the API, and keeping the type is how a second shape for one fact survives in
// the type layer after it has gone from the wire -- the same failure that had
// this page read `{bucket, n_resolved}` against an emitter sending
// `{label, n}` and render a calibration section that had never once appeared in
// a deploy.
//
// What IS taken from origin/v2-wire: the `number | null` widening on
// `GamePrediction` above (pydantic 2.13.5 serialises NaN to `null`, so the wire
// already sends null for an absent forecast), and the removal of the
// `home_total_yards` / `away_total_yards` family from `GameSummary` above,
// which is #8 "stop publishing a team total yards the model cannot compute".
// The CFB backend still emits `weekly_trend`; the CFB fixture in
// TrackRecordPage.test.tsx is dumped rather than typed and asserts the page
// does NOT read it, which is the honest way to carry a payload this contract no
// longer describes.
// ---------------------------------------------------------------------------
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
  /**
   * The same three accuracies as the headline, over EVERY resolved row -- rebuilt INCLUDED.
   * The headline is the pre-kickoff record and rebuilt picks never count toward it, because a
   * hit rate is only meaningful if the pick existed before the result. What B8 adds is that
   * nothing is hidden and everything is counted, in two figures instead of one.
   */
  all_picks?: AllPicksRecord;
  /** One row per resolved (game, market) pick, hit and miss alike, never filtered. */
  per_pick?: PerPickRow[];
}
export interface AllPicksRecord {
  n_resolved: number;
  pct_moneyline_correct: number | null;
  pct_ats_correct: number | null;
  pct_totals_correct: number | null;
}
export interface PerPickRow {
  game_id: string;
  gameday: string;
  market: "moneyline" | "ats" | "totals";
  pick: string;
  actual: string;
  hit: boolean;
  rebuilt: boolean;
  /** The time the pick was made. The plan's standing constraint is that every pick is
   *  displayed with the time it was made; until B8 this was stored and exposed nowhere. */
  snapshotted_at: string;
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
