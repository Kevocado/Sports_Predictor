# SDD ledger — plan: Sports Predictor Enhancement - Task 6

## Tasks

- [x] Task 1-5: Previous tasks (from other plan)
- [ ] Task 6: Add Conference Grouping to GamesPage

## Status

Starting Task 6: Add Conference Grouping to GamesPage.

Base commit: 977464488d52f671867135a55b55ab8b6d68787f

### Task 6: Add Conference Grouping to GamesPage

**Files to create/modify:**
- Create: `src/lib/groupGamesByDateAndConference.ts`
- Modify: `src/pages/GamesPage.tsx`
- Modify: `src/types.ts` (add conference fields - already present)

**Requirements:**
1. Create grouping utility at `src/lib/groupGamesByDateAndConference.ts`
2. Update GamesPage.tsx to use grouping by date and conference
3. Display dates as sections with conferences as filter chips
4. Within each date, show games chronologically grouped by conference

**Implementation Notes:**
- Conference fields already exist in GameSummary interface
- Need to group games first by date, then by conference matchup
- Display as collapsible date sections with conference filter chips
- Within each date, games should be grouped by conference

**Progress:**

- [ ] Create grouping utility file
- [ ] Update GamesPage.tsx with grouping logic
- [ ] Test and build
- [ ] Commit changes
