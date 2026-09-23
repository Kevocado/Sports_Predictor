import type { HeadToHeadMeeting } from "../types";

export function HeadToHead({ meetings }: { meetings: HeadToHeadMeeting[] }) {
  if (meetings.length === 0) {
    return <p className="text-xs text-sp-text-faint">No past meetings found.</p>;
  }
  return (
    <div className="flex flex-col gap-1.5">
      {meetings.map((m) => {
        const winner =
          m.home_score > m.away_score ? m.home_team
          : m.away_score > m.home_score ? m.away_team
          : null;
        return (
          <div key={m.game_id} className="flex items-center justify-between gap-2 rounded-lg bg-sp-850/60 px-3 py-1.5 text-xs">
            <span className="text-sp-text-dim">{m.season} · {m.away_team} at {m.home_team}</span>
            <span className="font-mono text-sp-text">
              {m.away_score}–{m.home_score}
              {winner && <span className="ml-2 font-sans text-sp-text-faint">{winner} won</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}
