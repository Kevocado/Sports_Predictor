import type { ReactNode } from "react";

interface MarketBarProps {
  label: ReactNode;
  prob: number;
}

export function MarketBar({ label, prob }: MarketBarProps) {
  const pct = Math.round(prob * 100);
  return (
    <div className="rounded-lg bg-sp-850/60 px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sp-text-dim">{label}</span>
        <span className="font-mono font-semibold text-sp-text">{pct}%</span>
      </div>
      <div className="relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-sp-border/60">
        <div className="absolute inset-y-0 left-0 rounded-full bg-sp-gold" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
