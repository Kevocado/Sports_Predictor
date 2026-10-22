// The track record page, rebuilt on the shared Track Record kit.
//
// Every sport maps its own API onto one `RecordModel` and the kit renders it,
// so this page no longer owns the counting arithmetic, the Wilson range, the
// week strip, the calibration chart or the verdict words. Sports uses the kit
// blocks with its own markets plugged in.
//
// What changed vs the previous page:
//
//  - The headline is `RecordHeadline` in `counted` mode: every recorded pick
//    leads, and the pre-kickoff subset is printed beside it (PRODUCT.md).
//  - The per-pick table moved into a collapsed `<details>` at the bottom so
//    the page opens on the summary, not a 240-row table.
//  - Recent picks are `RecentPicks` (<= 10 rows), not another table.
//  - "How this is counted" is `HowCounted`, stated once.
//  - Market words come from `marketLabel` (`Spread`, `Total`, never raw
//    `ats`/`totals`); verdicts are `Right`/`Wrong` (never `hit`/`miss`).
//  - `track-record.css` and the ad-hoc section nav are gone; sections are
//    `RecordBlock`s.
//
// Open question: yardage, position, points and the vs-market comparison were
// not carried onto the kit in this phase. Should they be kept as
// sport-specific `RecordBlock` plugs (as NBA keeps its Disagreements block),
// or is the simplified kit page above the right shape for Sports?

import { useEffect, useState } from "react";
import type { TrackRecord, YardageTrackRecord } from "../types";
import { useSport } from "../context/SportContext";
import {
  CalibrationBlock,
  HowCounted,
  RecordBlock,
  RecordHeadline,
  RecentPicks,
  StatTable,
  StatTile,
  WeekStrip,
  momentFor,
} from "../predictor-ui";
import { brier, plural, rate } from "../lib/trackFormat";
import { labelFor, toRecordModel } from "../lib/recordModel";
import "./track-record.css";

const n0 = (x: number) => x.toLocaleString("en-US");

/** Render snapshotted_at as a real time, not a raw ISO string. */
function formatPickTime(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}, ${d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
}

export function TrackRecordPage() {
  const { api, sport } = useSport();
  const [record, setRecord] = useState<TrackRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRecord(null);
    setError(null);
    api.trackRecord().then(setRecord).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [api, sport]);

  if (error) return <p role="alert" className="text-sm text-loss">{error}</p>;
  if (!record) return <p className="text-sm text-sp-text-faint">Loading…</p>;

  const { games, player_props } = record;
  const { passing_yards, rushing_yards, receiving_yards } = player_props;
  const model = toRecordModel(record);
  const moment = momentFor(sport);

  const per_pick = games.per_pick ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="mb-1 font-display text-2xl font-semibold uppercase tracking-wide text-sp-text">Track Record</h2>
        <p className="mb-4 text-xs text-sp-text-faint">
          How good the model actually is, in aggregate — not a game-by-game log.
        </p>
      </div>

      {/* Calibration chart as hero: full width under the header, above the record. */}
      <CalibrationBlock series={model.calibration ?? []} markets={model.markets} />

      <RecordBlock id="tr-record" title="Record">
        {games.n_resolved === 0 ? (
          <p className="text-sm text-pr-text-faint">No resolved games yet — check back once this week's games are final.</p>
        ) : (
          <>
            <RecordHeadline markets={model.markets} mode={model.headline} lead={model.lead} moment={moment} />
            <p className="max-w-prose text-sm text-pr-text-dim" data-testid="rebuilt-note">
              {games.n_rebuilt != null && games.n_rebuilt > 0
                ? `${n0(games.n_resolved)} counted picks in this record, of which ${n0(
                    games.n_rebuilt,
                  )} were made at or after their own kickoff and are counted like any other. The figure beside each
                  market is the pre-kickoff subset.`
                : games.n_pre_kickoff != null
                  ? `${n0(games.n_pre_kickoff)} of ${n0(games.n_resolved)} counted picks were made before their own
                      kickoff.`
                  : `Every pick in this record is counted here. The figure beside each market is the pre-kickoff subset.`}
            </p>
          </>
        )}
      </RecordBlock>

      <RecordBlock id="tr-week" title="By week">
        <WeekStrip weeks={model.weeks ?? []} />
      </RecordBlock>

      <RecordBlock id="tr-recent" title="Latest counted picks">
        <RecentPicks picks={model.recent ?? []} limit={10} moment={moment} />
      </RecordBlock>

      {/* Yardage markets: how far off the projected yardage was, per market. */}
      <details className="rounded-pr border border-pr-rule bg-pr-panel px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold text-pr-text">Yardage markets</summary>
        <div className="mt-3">
          <RecordBlock
            id="tr-yardage"
            title="Yardage markets"
            caption="Mean absolute error: how far off the projected yardage was, per market, in yards."
          >
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <StatTile label="Passing yards" value={maeText(passing_yards)} sub={`${passing_yards.n_resolved} props`} />
              <StatTile label="Rushing yards" value={maeText(rushing_yards)} sub={`${rushing_yards.n_resolved} props`} />
              <StatTile label="Receiving yards" value={maeText(receiving_yards)} sub={`${receiving_yards.n_resolved} props`} />
            </div>
          </RecordBlock>
        </div>
      </details>

      {/* By position: error by position group. */}
      <details className="rounded-pr border border-pr-rule bg-pr-panel px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold text-pr-text">By position</summary>
        <div className="mt-3">
          <RecordBlock id="tr-position" title="By position" caption="Mean absolute error by position group.">
            <StatTable
              rows={positionRows(player_props)}
              rowKey={(r) => `${r.market}-${r.position}`}
              caption="Position groups with resolved props."
              columns={[
                { key: "market", label: "Market", value: (r) => r.market },
                { key: "position", label: "Position", value: (r) => r.position },
                { key: "mae", label: "MAE (yards)", numeric: true, value: (r) => r.mae },
              ]}
            />
          </RecordBlock>
        </div>
      </details>

      {/* Points: anytime-TD scoring accuracy. */}
      <details className="rounded-pr border border-pr-rule bg-pr-panel px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold text-pr-text">Points</summary>
        <div className="mt-3">{renderPoints(player_props)}</div>
      </details>

      {per_pick.length > 0 && (
        <details className="rounded-pr border border-pr-rule bg-pr-panel px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold text-pr-text">Every recorded pick</summary>
          <div className="mt-3">
            <StatTable
              rows={[...per_pick].sort((a, b) => b.snapshotted_at.localeCompare(a.snapshotted_at))}
              rowKey={(r) => `${r.market}-${r.game_id}-${r.snapshotted_at}`}
              caption="Per-pick detail: market, pick, result and when it was made"
              columns={[
                { key: "market", label: "Market", value: (r) => labelFor(r.market) },
                { key: "pick", label: "Pick", value: (r) => r.pick },
                { key: "actual", label: "Actual", value: (r) => r.actual },
                {
                  key: "hit",
                  label: "Result",
                  value: (r) => (r.hit ? 1 : 0),
                  render: (r) => (r.hit ? <span className="font-semibold text-pr-win">Right</span> : <span className="font-semibold text-pr-loss">Wrong</span>),
                },
                {
                  key: "when",
                  label: "Made",
                  value: (r) => (r.made_before_kickoff ? 1 : 0),
                  render: (r) => (r.made_before_kickoff ? "Before kickoff" : "After kickoff"),
                },
                ...(per_pick.some((r) => r.counted !== undefined)
                  ? [{
                      key: "counted",
                      label: "In the record",
                      value: (r: { counted?: boolean }) => (r.counted ? 1 : 0),
                      render: (r: { counted?: boolean }) => (r.counted ? "counted" : "history, not the counted pick"),
                    }]
                  : []),
                { key: "time", label: "Time made", value: (r) => formatPickTime(r.snapshotted_at) },
              ]}
            />
          </div>
        </details>
      )}

      <HowCounted moment={moment} headline={model.headline} />
    </div>
  );
}

function maeText(yardage: YardageTrackRecord): string {
  const mae = yardage.mean_absolute_error;
  return mae == null ? "—" : `${mae.toLocaleString("en-US")} yards`;
}

/** Flatten each yardage market's per-position errors into one table. */
function positionRows(player_props: TrackRecord["player_props"]): { market: string; position: string; mae: number | null }[] {
  const rows: { market: string; position: string; mae: number | null }[] = [];
  const markets: { [market: string]: YardageTrackRecord | undefined } = {
    passing_yards: player_props.passing_yards,
    rushing_yards: player_props.rushing_yards,
    receiving_yards: player_props.receiving_yards,
  };
  for (const [market, yardage] of Object.entries(markets)) {
    if (!yardage) continue;
    if (yardage.by_position) {
      for (const row of yardage.by_position) rows.push({ market, position: row.position, mae: row.mean_absolute_error });
    } else if (yardage.mae_by_position) {
      for (const [position, mae] of Object.entries(yardage.mae_by_position)) rows.push({ market, position, mae });
    }
  }
  return rows;
}

function renderPoints(player_props: TrackRecord["player_props"]) {
  const td = player_props.anytime_td;
  const buckets = td.confidence_buckets ?? [];
  const called = td.n_called;

  if (td.n_resolved === 0) {
    return <NotRecorded why="No resolved player props yet — check back once this week's games are final." />;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <AccuracyCard
          label="Anytime-TD rate"
          accuracy={td.hit_rate_when_called}
          graded={called == null ? "call count not reported" : plural(called, "call") + " of " + plural(td.n_resolved, "prop") + " at 50% or better"}
          testId="accuracy-bar-anytime-td"
        />
        <StatTile
          label="Anytime-TD Brier score"
          value={brier(td.brier_score)}
          sub="over N props · lower is better · 0.25 is a coin flip"
        />
        <StatTile
          label="Props resolved"
          value={td.n_resolved.toLocaleString("en-US")}
          sub={called == null ? "call count not reported" : plural(called, "call") + " at 50% or better"}
        />
      </div>

      {buckets.length > 0 && (
        <StatTable
          rows={buckets.map((b, i) => ({ ...b, key: `${b.label}-${i}` }))}
          rowKey={(b) => b.key}
          caption="Anytime-TD rate by predicted-probability band"
          columns={[
            { key: "label", label: "Predicted", value: (b) => b.label },
            { key: "n", label: "Props", numeric: true, value: (b) => b.n },
            {
              key: "hit_rate",
              label: "Rate",
              numeric: true,
              firstDir: "desc",
              value: (b) => b.hit_rate,
              render: (b) =>
                b.n > 0 ? (
                  <RateCell value={b.hit_rate} n={b.n} />
                ) : (
                  <span className="text-pr-text-faint">no calls</span>
                ),
            },
          ]}
        />
      )}
    </>
  );
}

function AccuracyCard({
  label,
  accuracy,
  graded,
  testId,
}: {
  label: string;
  accuracy: number | null | undefined;
  graded: string;
  testId?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-pr border border-pr-rule bg-pr-panel p-4" data-testid={testId}>
      <span className="text-xs font-semibold uppercase tracking-wide text-pr-text-dim">{label}</span>
      <span className="font-pr-display text-2xl font-semibold text-pr-text">{rate(accuracy)}</span>
      <AccuracyBar value={accuracy} />
      <span className="text-xs text-pr-text-faint">{graded}</span>
    </div>
  );
}

function AccuracyBar({ value, testId = "accuracy-bar" }: { value: number | null | undefined; testId?: string }) {
  const width = value == null ? 0 : Math.min(100, Math.max(0, value * 100));
  return (
    <span className="tr-bar" data-testid={testId} aria-hidden="true">
      <span className="tr-bar-fill" style={{ width: `${width}%` }} />
      <span className="tr-bar-marker" data-testid="accuracy-50-marker" />
    </span>
  );
}

function RateCell({ value, n }: { value: number | null | undefined; n: number | undefined }) {
  if (value == null) return <span className="text-pr-text-faint">—</span>;
  return (
    <span className="tr-num" data-testid="rate">
      {rate(value)} <span className="text-pr-text-faint">({n ?? "—"})</span>
    </span>
  );
}

/** A section whose data this payload does not carry, said plainly. */
function NotRecorded({ why }: { why: string }) {
  return (
    <p className="rounded-pr border border-pr-rule bg-pr-panel px-3 py-2 text-sm text-pr-text-dim" data-testid="not-recorded">
      {why}
    </p>
  );
}
