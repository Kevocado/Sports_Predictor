import { useEffect, useState } from "react";
import type { TrackRecord } from "../types";
import { useSport } from "../context/SportContext";

export function TrackRecordPage() {
  const { api, sport } = useSport();
  const [record, setRecord] = useState<TrackRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRecord(null); setError(null);
    api.trackRecord().then(setRecord).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [api, sport]);

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-sp-text">Track Record</h2>
      {error && <p role="alert" className="text-sm text-loss">{error}</p>}
      {!record && !error && <p className="text-sm text-sp-text-faint">Loading…</p>}
      {record && (
        <div className="flex flex-col gap-2 rounded-xl border border-sp-border bg-sp-850/70 p-4">
          <p className="text-sm text-sp-text-dim">Resolved games: <span className="font-semibold text-sp-text">{record.n_resolved_games}</span></p>
          <p className="text-sm text-sp-text-dim">Moneyline accuracy: <span className="font-semibold text-sp-text">{record.pct_moneyline_correct != null ? `${Math.round(record.pct_moneyline_correct * 100)}%` : "No resolved games yet"}</span></p>
        </div>
      )}
    </div>
  );
}
