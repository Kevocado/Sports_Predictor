import { useEffect, useState } from "react";
import type { SportApi, TeamRanking } from "../types";

function record(r: TeamRanking): string {
  return `${r.wins}-${r.losses}${r.ties ? `-${r.ties}` : ""}`;
}

export function PowerRankingsPanel({ api, season }: { api: SportApi; season: number }) {
  const [rankings, setRankings] = useState<TeamRanking[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRankings(null); setError(null);
    api.powerRankings(season)
      .then((r) => { if (!cancelled) setRankings(r.rankings); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [api, season]);

  if (error) return <p role="alert" className="text-sm text-loss">{error}</p>;
  if (!rankings) return <p className="text-sm text-sp-text-faint">Loading power rankings…</p>;
  if (rankings.length === 0) return <p className="text-sm text-sp-text-faint">No power rankings available for this season yet.</p>;

  // NFL rows carry division; CFB has no division concept (conference
  // realignment only) and its rows never populate it -- label the column by
  // whichever field this sport's rows actually have.
  const groupLabel = rankings.some((r) => r.division != null) ? "Division" : "Conference";

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-sp-text-faint">
            <th className="pb-2 pr-2 font-medium">#</th>
            <th className="pb-2 pr-2 font-medium">Team</th>
            <th className="pb-2 pr-2 font-medium">Rating</th>
            <th className="pb-2 pr-2 text-right font-medium">Record</th>
            <th className="pb-2 text-right font-medium">{groupLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rankings.map((r) => (
            <tr key={r.team} className="border-t border-sp-border/40">
              <td className="py-1.5 pr-2 font-mono text-sp-text-dim">{r.rank}</td>
              <td className="py-1.5 pr-2 font-medium text-sp-text">{r.team}</td>
              <td className="py-1.5 pr-2 font-mono text-sp-text-dim">{Math.round(r.rating)}</td>
              <td className="py-1.5 pr-2 text-right font-mono text-sp-text-dim">{record(r)}</td>
              <td className="py-1.5 text-right text-sp-text-dim">{r.division ?? r.conference ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
