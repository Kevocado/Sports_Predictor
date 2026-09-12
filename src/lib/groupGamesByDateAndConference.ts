import type { GameSummary } from "../types";

export function groupGamesByDateAndConference(games: GameSummary[]): Record<string, Record<string, GameSummary[]>> {
  const groups: Record<string, Record<string, GameSummary[]>> = {};
  
  for (const game of games) {
    // Extract date from gameday (ISO string)
    const date = new Date(game.gameday);
    const dateKey = date.toISOString().split('T')[0];
    
    // Get conferences
    const homeConf = game.home_conference || 'Independent';
    const awayConf = game.away_conference || 'Independent';
    
    // Create date group if needed
    if (!groups[dateKey]) {
      groups[dateKey] = {};
    }
    
    // Create conference key for this date
    const confKey = `${homeConf} vs ${awayConf}`;
    if (!groups[dateKey][confKey]) {
      groups[dateKey][confKey] = [];
    }
    groups[dateKey][confKey].push(game);
  }
  
  return groups;
}
