interface Props {
  home: number;
  away: number;
  homeLabel?: string;
  awayLabel?: string;
}

export function ProbabilityBar({ home, away, homeLabel = "H", awayLabel = "A" }: Props) {
  const pct = (v: number) => `${(v * 100).toFixed(0)}%`;
  return (
    <div className="w-full">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-sp-850">
        <div className="bg-win" style={{ width: pct(home) }} />
        <div className="bg-loss" style={{ width: pct(away) }} />
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] font-medium text-sp-text-dim">
        <span>{homeLabel} <span className="font-mono text-sp-text">{pct(home)}</span></span>
        <span>{awayLabel} <span className="font-mono text-sp-text">{pct(away)}</span></span>
      </div>
    </div>
  );
}
