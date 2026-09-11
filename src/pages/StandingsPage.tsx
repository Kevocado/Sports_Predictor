import { useEffect, useMemo, useState } from "react";
import type { StandingsEntry } from "../types";
import { useSport } from "../context/SportContext";

const FALLBACK_SEASON = 2026;

// NFL rows carry division_rank fields (grouped/ranked within their
// division); CFB has no fixed divisions any more and carries
// conference_rank fields instead (grouped/ranked within conference). A row
// only ever has one set populated -- these just read whichever applies.
function groupLabel(e: StandingsEntry): string {
  return e.division ?? e.conference ?? "Other";
}
function projectedRank(e: StandingsEntry): number {
  return e.projected_division_rank ?? e.projected_conference_rank ?? 999;
}
function currentRank(e: StandingsEntry): number | undefined {
  return e.current_division_rank ?? e.current_conference_rank;
}
function rankDelta(e: StandingsEntry): number | undefined {
  return e.division_rank_delta ?? e.conference_rank_delta;
}

export function StandingsPage() {
  const { api, sport } = useSport();
  const [season, setSeason] = useState(FALLBACK_SEASON);
  const [rows, setRows] = useState<StandingsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.currentWeek().then((cw) => { if (!cancelled) setSeason(cw.season); }).catch(() => {});
    return () => { cancelled = true; };
  }, [api, sport]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null); setRows([]);
    api.standings(season)
      .then((r) => { if (!cancelled) setRows(r); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, sport, season]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, StandingsEntry[]>();
    for (const row of rows) {
      const key = groupLabel(row);
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(row);
    }
    for (const groupRows of byGroup.values()) {
      groupRows.sort((a, b) => projectedRank(a) - projectedRank(b));
    }
    return [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  return (
    <div>
      <div className="mb-4">
        <h2 className="text-lg font-bold text-sp-text">{season} Season Standings</h2>
        <p className="text-xs text-sp-text-faint">Projected final record from here on, based on the model's prediction for every remaining game.</p>
      </div>
      {loading && <p className="text-sm text-sp-text-faint">Loading… (a season-long projection takes a moment)</p>}
      {error && <p role="alert" className="text-sm text-loss">{error}</p>}
      {!loading && !error && groups.length === 0 && (
        <p className="text-sm text-sp-text-faint">No standings available yet.</p>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {groups.map(([label, groupRows]) => (
          <section key={label} className="rounded-xl border border-sp-border bg-sp-850/40 p-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-sp-text-faint">{label}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-sp-text-faint">
                    <th className="pb-2 pr-2 font-medium">#</th>
                    <th className="pb-2 pr-2 font-medium">Team</th>
                    <th className="pb-2 pr-2 text-right font-medium">Record</th>
                    <th className="pb-2 pr-2 text-right font-medium">Proj. record</th>
                    <th className="pb-2 text-right font-medium">Proj. PD</th>
                  </tr>
                </thead>
                <tbody>
                  {groupRows.map((row) => {
                    const delta = rankDelta(row);
                    const cRank = currentRank(row);
                    return (
                      <tr key={row.team} className="border-t border-sp-border/40">
                        <td className="py-1.5 pr-2 font-mono text-sp-text-dim">
                          {projectedRank(row)}
                          {delta != null && delta !== 0 && (
                            <span className={`ml-1 ${delta > 0 ? "text-win" : "text-loss"}`} title={`Currently #${cRank ?? "?"} in ${label}`}>
                              {delta > 0 ? "▲" : "▼"}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-2 font-medium text-sp-text">{row.team}</td>
                        <td className="py-1.5 pr-2 text-right font-mono text-sp-text-dim">
                          {row.wins}-{row.losses}{row.ties ? `-${row.ties}` : ""}
                        </td>
                        <td className="py-1.5 pr-2 text-right font-mono text-sp-text-dim">
                          {row.projected_wins.toFixed(1)}-{row.projected_losses.toFixed(1)}
                        </td>
                        <td className={`py-1.5 text-right font-mono ${row.projected_point_diff >= 0 ? "text-win" : "text-loss"}`}>
                          {row.projected_point_diff >= 0 ? "+" : ""}{row.projected_point_diff.toFixed(0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
