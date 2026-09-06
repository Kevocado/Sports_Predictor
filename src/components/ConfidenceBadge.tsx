export function ConfidenceBadge({ homeWinProb, awayWinProb }: { homeWinProb: number; awayWinProb: number }) {
  const confidence = Math.max(homeWinProb, awayWinProb);
  const pct = Math.round(confidence * 100);
  const tone = confidence >= 0.7 ? "bg-win/20 text-win" : confidence >= 0.55 ? "bg-sp-gold/20 text-sp-gold" : "bg-sp-700/60 text-sp-text-dim";
  return <span className={`rounded px-1.5 py-0.5 font-semibold ${tone}`}>{pct}% confident</span>;
}
