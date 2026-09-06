# Sports Predictor: Design Spec

**Date:** 2026-09-06
**Status:** approved, pending implementation plan

## Purpose

A single, unified frontend for the NFL and CFB prediction backends
(`NFL_Predictor`, `CFB_Predictor`) — one place to browse both sports'
weekly slates, switch between them, sort for the most confident
predictions, and see a game's match markets and its player props
together in one view. Replaces the two existing bare-bones,
unstyled frontends each backend currently ships with its own
`frontend/` directory; both backends stay untouched (read-only API
consumers, no backend code changes).

Visually modeled on `Prem_Predictor/PL_Predictor`'s frontend — the
most mature of the four sibling prediction apps — but with its own
accent identity rather than a literal reskin, since this app is not
Premier-League-branded.

## Why this exists (context from the brainstorming session)

The two backends (`NFL_Predictor`, `CFB_Predictor`) were built as
near-verbatim architectural ports of each other (see each project's own
design spec) and already expose near-identical REST APIs — same five
endpoints, same response shapes modulo one field (`GameSummary.
spread_line`/`total_line` exist on NFL's schedule data, not CFB's,
since nflverse bundles Vegas lines and CFBD doesn't). Each shipped with
its own minimal, unstyled React scaffold (Tasks 18-21 of each backend's
own build) — functional, but never intended as the final UI, and
visually nothing like the polished `PL_Predictor` frontend that exists
in the same project folder.

## Scope (v1)

**In scope:**
- One frontend app, two backends: a sport toggle (NFL / CFB) switches
  which backend's data is shown; nothing is merged server-side.
- Weekly games grid, one card per game, styled after `PL_Predictor`'s
  `CurrentGameweekCard`.
- Click-through detail view (modal) per game showing full match markets
  (win/cover/total probabilities) **and** that game's player prop
  predictions (anytime-TD, yardage) together — the single most
  important UX requirement from the brainstorming session ("match and
  player predictions on the same tile or link").
- A "sort by confidence" control on the games grid: ranks games by
  `max(home_win_prob, away_win_prob)` descending, no live odds
  required (both backends currently have no `ODDS_API_KEY` configured
  in this dev environment, so an edge-based sort would show nothing).
- Track Record view, per sport (each backend tracks its own history
  independently — no cross-sport merge).
- Diagnose and fix the "player props don't show up" complaint. CFB's
  backend was directly verified during brainstorming to return real
  data (`GET /api/players/2026/1/props` → 339KB, real predictions,
  ~11s response) — so this is very likely a frontend-side bug (no
  loading affordance for an 11-second fetch reading as "broken"), not
  a backend defect. Confirm the actual cause against a real running
  instance during implementation and fix whatever's found. NFL's
  player props returning empty is a **different, already-diagnosed,
  out-of-scope issue**: nflverse hasn't published 2025/2026 season
  player stats yet (an external data-publication lag documented in
  NFL_Predictor's own build history) — nothing in this frontend can
  fix that; the UI should just show "no player props available yet"
  gracefully rather than a blank/broken-looking state.

**Explicitly out of scope for v1:**
- PL_Predictor and F1_Predictor are NOT folded into this app. They
  keep their own existing, independent frontends. `predictor-hub`
  still links to those two separately.
- Any backend changes to NFL_Predictor or CFB_Predictor, **with one
  narrow, confirmed exception**: both backends' `GET /api/players/
  {season}/{week}/props` route already computes each player's
  `recent_team` (and `position`) internally (`api/routes.py`'s
  `get_player_props`, confirmed identical in both projects) but drops
  both fields before returning the response dict. Add `recent_team`
  and `position` to the returned dict in both backends — a one-line,
  purely-additive change per project, touching no model logic, no
  other route, no schema/database change. This is required for
  `GameDetailModal` to correctly filter a game's player props by team
  (see Components section) — without it, the flagship "match and
  player predictions together" feature can't actually filter per game.
  No other backend change is in scope; `allow_origins=["*"]` CORS is
  already configured on both, so no CORS change is needed either.
- Cross-sport merged track record, or a unified "best prediction
  across both sports" ranking (the confidence sort operates within
  whichever sport is currently active, not across both at once — that
  would require fetching both backends simultaneously on every view,
  which isn't asked for and adds real complexity for a feature nobody
  requested).
- Editing `predictor-hub/index.html` to point at this app (a separate,
  human-confirmed step once this app is actually deployed — same
  posture as every other hub-card task in this project family).
- Value-bet display (neither backend currently has a live odds key
  configured, and NFL_Predictor's own value-bet detection is already a
  documented, deliberately-parked gap — not this frontend's problem to
  solve).

## Project layout

New top-level, frontend-only repo at
`/Users/sigey/Documents/Projects/Sports_Predictor` (own git repo, no
backend of its own).

```
src/
  api/
    client.ts            createApiClient(baseUrl) factory + nflApi/cfbApi instances
  context/
    SportContext.tsx      active-sport state (NFL | CFB), provides the active api client
  types.ts                 shared GameSummary/GamePrediction/PlayerPropPrediction/
                            TrackRecord/RetrainResponse (GameSummary's spread_line/
                            total_line are optional to accommodate both backends)
  components/
    SportToggle.tsx
    GameCard.tsx           compact per-game tile (à la PL's CurrentGameweekCard)
    GameDetailModal.tsx    match markets + player props together (à la PL's FixtureModal)
    ConfidenceBadge.tsx
    TeamName.tsx           (no team badge image assets exist for NFL/CFB teams yet —
                            text-based, styled, not an image lookup like PL's TeamBadge)
  pages/
    GamesPage.tsx
    TrackRecordPage.tsx
  App.tsx
  main.tsx
  index.css
docs/
  superpowers/specs/       this file
  superpowers/plans/       implementation plan(s)
```

## Data flow

Both `NFL_Predictor` and `CFB_Predictor` already expose:
```
GET  /api/games?season=&week=
GET  /api/games/{season}/{week}/{game_id}/prediction
GET  /api/players/{season}/{week}/props
GET  /api/track-record
POST /api/retrain
```
identical shapes except `GameSummary` (NFL has `spread_line`/
`total_line`; CFB doesn't — both are typed optional in the shared
`types.ts`). This app makes browser-side `fetch` calls directly to
whichever backend is active — no server-side proxy, no backend
changes. Locally: NFL at `http://localhost:8001/api`, CFB at
`http://localhost:8003/api` (matching each backend's own established
port). In production, two env vars (`VITE_NFL_API_BASE_URL`,
`VITE_CFB_API_BASE_URL`) point at each backend's real deployed URL —
mirroring the existing single-`VITE_API_BASE_URL` pattern each
backend's own frontend scaffold already uses, just doubled.

`GamesPage` fetches `api.games(season, week)` for the active sport,
then fetches each game's `gamePrediction` the same way both existing
scaffolds already do (`Promise.all`, one per visible game, tolerating
per-game failure). Player props for the whole week are fetched once
(`api.playerProps(season, week)`) and matched to a game by team name
(`home_team`/`away_team` against each prop's implicit team — see the
Component Details section on how this join is derived, since neither
API response links a prop directly to a `game_id` today).

## Components

**`SportToggle`** — two buttons (NFL / CFB), updates
`SportContext`'s active sport. Switching sport resets the games list
(different season defaults are plausible later, but v1 hardcodes
`season=2026, week=1` for both, matching both backends' own existing
frontend scaffolds).

**`GameCard`** — one per game: team names, kickoff date, win
probability, over/total if present. Clicking opens `GameDetailModal`
for that game. Sorted by whatever the active sort mode says (default:
chronological by kickoff, same as today; "confidence" mode sorts by
`max(home_win_prob, away_win_prob)` descending).

**`GameDetailModal`** — the core deliverable. Shows, for one game:
- Full match markets: home/away win probability, cover probability
  (if present), over/under probability (if present) — reusing the
  probability-bar visual pattern from `PL_Predictor`'s `MarketBar`/
  `ProbabilityBar` (adapted: two-outcome win/loss instead of
  three-outcome win/draw/loss, since neither NFL nor CFB has draws).
- Player props for that specific game: filtered from the week's full
  `playerProps` response by matching `recent_team` against the game's
  `home_team`/`away_team`. **Confirmed empirically during
  brainstorming** (not guessed): the real running CFB backend's
  current response has only `player_id`, `player_name`,
  `anytime_td_prob`, and per-market yardage — no team field — but
  `api/routes.py`'s `get_player_props` already has `recent_team` and
  `position` in hand internally (`latest_players` selects both columns
  at line 213/136) and simply never includes them in the response
  dict it builds. Per the resolved scope decision above, both backends
  get a one-line addition (`"recent_team": player["recent_team"],
  "position": player["position"]` added to the dict built in the
  results loop) — this is the ONLY backend change in this plan's
  scope. Once that lands, `PlayerPropPrediction` gains `recent_team:
  string` and `position: string` fields, and `GameDetailModal` filters
  the week's player-prop list to `recent_team === home_team ||
  recent_team === away_team` for the game being viewed.

**`ConfidenceBadge`** — small pill showing e.g. "82% confident",
derived from `max(home_win_prob, away_win_prob)`.

**`TeamName`** — plain styled text, not an image badge. Neither
backend exposes team logo/crest URLs (unlike PL_Predictor, which has
`TeamBadge` image lookups for 20 known Premier League clubs) — CFB
alone has ~134 FBS teams, so a hand-maintained crest lookup is out of
scope for v1. A colored initial-letter avatar (first letter of the
team name, deterministic color from a hash of the name) is a
reasonable lightweight visual substitute, used consistently everywhere
PL's `TeamBadge` would appear.

## Design system

Same structural language as `PL_Predictor`'s frontend — Tailwind CSS,
Inter font (Google Fonts), dark theme via CSS custom properties,
`clip-corner` card styling, modal-with-backdrop-blur pattern, the same
spacing/typography scale — but its own accent identity, not PL's
purple/pink:
- Dark near-black base (matching PL's structural approach of a radial
  gradient over a near-black background).
- A distinct accent hue for the app itself (proposed: deep amber/gold,
  distinct from PL's purple and F1's likely palette — confirmed
  acceptable in brainstorming as "a distinct Predictor-family hue").
- NFL and CFB each get a subtle secondary accent shift when active
  (e.g. NFL leans a cool blue, CFB leans a warmer orange) layered over
  the shared base palette, so switching sports is visually obvious
  without changing the whole app's identity.
- Confidence/value coloring reuses PL's semantic pattern (`--color-win`
  green equivalent for high confidence, neutral for uncertain) rather
  than inventing a new one.

## Testing

Component-level tests (Vitest + React Testing Library, matching the
tooling already implied by this being a Vite/React/TS stack) for:
`SportToggle` (switching updates context/active client), the
confidence sort (given a fixed set of games, produces the expected
order), `GameCard` (renders team names/probabilities correctly,
handles a null cover/total gracefully), and `GameDetailModal`'s
player-prop filtering logic specifically (once the team-field question
above is resolved empirically) — this is the one area most likely to
silently show wrong data if the join is wrong, so it needs a real
test, not just a visual check.

A manual browser pass against both real, currently-running backends
(NFL at :8001, CFB at :8003) is required before calling this done —
specifically re-testing the player-props-don't-show-up complaint
against a real browser, not just a `curl` response.

## Deploy

Same Vite + Dockerfile pattern as the other three sibling frontends
(static build, served by... actually this app has no backend of its
own to bundle into, so deploy is a **static site**, not a Docker web
service — closer to how a plain Vite build would deploy to Render's
static-site product, or any static host). `VITE_NFL_API_BASE_URL`/
`VITE_CFB_API_BASE_URL` are build-time env vars pointing at each
backend's real deployed URL once those exist. Not deployed as part of
this plan (same human-confirmed-action posture as every other deploy
step in this project family) — the plan's own final task should
verify the app *builds* successfully, not deploy it.

## Open items to confirm during implementation

- The actual root cause of "player props don't show up" — confirmed
  during brainstorming that CFB's backend itself returns real data;
  confirm in a real browser whether it's a missing loading state, a
  silent fetch error, or something else, and fix accordingly.
- Neither backend currently has ANY test covering `GET /api/players/
  {season}/{week}/props` at all (confirmed by grep against both
  `tests/test_api_routes.py` files) — the implementation plan should
  add one test per backend asserting `recent_team`/`position` are
  present in the response, alongside re-running each backend's full
  existing suite to confirm nothing else broke.
