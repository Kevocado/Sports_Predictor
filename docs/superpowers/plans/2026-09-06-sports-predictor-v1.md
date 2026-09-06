# Sports Predictor v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single React+TypeScript+Vite frontend at `Sports_Predictor` that consumes both `NFL_Predictor`'s and `CFB_Predictor`'s existing REST APIs directly from the browser, lets the user toggle between the two sports, browse a weekly games grid sortable by model confidence, and drill into a game to see its match markets and player props together.

**Architecture:** A single-page app with one React context (`SportContext`) holding the active sport and the matching `SportApi` client instance. Both backends already expose identical-shaped REST endpoints (`GET /api/games`, `GET /api/games/{season}/{week}/{game_id}/prediction`, `GET /api/players/{season}/{week}/props`, `GET /api/track-record`, `POST /api/retrain`) with one schema difference (`GameSummary.spread_line`/`total_line` exist on NFL, not CFB — both optional in the shared `types.ts`). The app makes direct browser `fetch` calls to whichever backend is active; there is no server-side proxy and no merged data model. Visual design follows `PL_Predictor`'s structural language (Tailwind, Inter font, dark theme, `clip-corner` cards, backdrop-blur modal) with a distinct amber/gold accent instead of PL's purple/pink, plus a subtle blue (NFL) / orange (CFB) secondary tint when each sport is active.

**Tech Stack:** React 19, TypeScript ~6.0, Vite 8, Tailwind CSS 4 (`@tailwindcss/vite`), Vitest + React Testing Library + jsdom (component tests), Python/FastAPI (the one in-scope backend change, in two other repos), pytest (backend tests).

**Spec:** `/Users/sigey/Documents/Projects/Sports_Predictor/docs/superpowers/specs/2026-09-06-sports-predictor-design.md`

## Global Constraints

- This app makes browser-side fetch calls directly to both backends (`allow_origins=["*"]` CORS already configured on both) — no server-side proxy, no backend changes beyond the one player-props field fix.
- Local dev: NFL backend at `http://localhost:8001/api`, CFB backend at `http://localhost:8003/api`. Production: `VITE_NFL_API_BASE_URL`/`VITE_CFB_API_BASE_URL` env vars.
- Same structural design language as PL_Predictor (Tailwind, Inter font, dark theme, clip-corner cards, modal pattern) but a distinct accent hue, not PL's purple/pink.
- No team badge images — text/initial-avatar substitute (CFB alone has ~134 FBS teams, no crest data available).
- Confidence sort (`max(home_win_prob, away_win_prob)` descending) needs no live odds and must always be available; value-bet/edge sorting is explicitly out of scope.
- PL_Predictor and F1_Predictor are NOT part of this app's scope.
- No deploy in this plan — build verification only.
- Season/week are hardcoded to `season=2026, week=1` for v1, matching both backends' own existing frontend scaffolds.

---

## Task 1: Backend field fix — add `recent_team`/`position` to player props response (NFL_Predictor and CFB_Predictor repos)

This is the ONE in-scope backend change. It touches two files in two DIFFERENT existing git repositories, neither of which is `Sports_Predictor`. **Commits for this task happen in `NFL_Predictor`'s and `CFB_Predictor`'s own git history, not in `Sports_Predictor`.** Do this task first — every later task's `PlayerPropPrediction` type and `GameDetailModal` filtering logic depends on the shape this produces.

**Files:**
- Modify: `/Users/sigey/Documents/Projects/NFL_Predictor/src/nfl_predictor/api/routes.py:145` (inside `get_player_props`)
- Modify: `/Users/sigey/Documents/Projects/CFB_Predictor/src/cfb_predictor/api/routes.py:222` (inside `get_player_props`)
- Test: `/Users/sigey/Documents/Projects/NFL_Predictor/tests/test_api_routes.py`
- Test: `/Users/sigey/Documents/Projects/CFB_Predictor/tests/test_api_routes.py`

**Interfaces:**
- Consumes: nothing from this plan (pre-existing backend code).
- Produces: `GET /api/players/{season}/{week}/props` on both backends now returns each player object with `recent_team: string` and `position: string` present, in addition to the fields it already returned (`player_id`, `player_name`, `anytime_td_prob`, and per-position yardage fields). Task 4's shared `PlayerPropPrediction` type and Task 11's `GameDetailModal` filtering both depend on these two fields actually being present in the JSON response.

- [ ] **Step 1: Confirm the current NFL_Predictor code and write the failing test**

Current code at `NFL_Predictor/src/nfl_predictor/api/routes.py:129-146`:

```python
@router.get("/players/{season}/{week}/props")
def get_player_props(season: int, week: int):
    models = _load_models_cached()
    player_history = _load_player_history(season)

    latest_players = (
        player_history[player_history["season"] == season]
        [["player_id", "player_name", "position", "recent_team"]]
        .drop_duplicates("player_id")
    )
    results = []
    for _, player in latest_players.iterrows():
        feature_row = player_usage.build_features_for_player(player["player_id"], player_history)
        if feature_row is None:
            continue
        props = player_props.predict_props(models["player_models"], feature_row, position=player["position"])
        results.append({"player_id": player["player_id"], "player_name": player["player_name"], **props})
    return results
```

Add this test to the end of `/Users/sigey/Documents/Projects/NFL_Predictor/tests/test_api_routes.py` (it is the first test in this file covering this route — confirmed by grep, no existing test covers `/players/{season}/{week}/props`):

```python
def test_get_player_props_includes_recent_team_and_position(client, monkeypatch):
    monkeypatch.setattr(
        routes, "_load_player_history",
        lambda season: pd.DataFrame(
            [{"player_id": "00-001", "player_name": "Pat Mahomes", "position": "QB",
              "recent_team": "KC", "season": season}]
        ),
    )
    monkeypatch.setattr(
        routes.player_usage, "build_features_for_player",
        lambda player_id, history: pd.Series({"dummy_feature": 1.0}),
    )
    monkeypatch.setattr(
        routes.player_props, "predict_props",
        lambda player_models, feature_row, position: {"anytime_td_prob": 0.42, "passing_yards": 275.0},
    )

    response = client.get("/api/players/2025/1/props")

    assert response.status_code == 200
    body = response.json()
    assert body[0]["recent_team"] == "KC"
    assert body[0]["position"] == "QB"
```

- [ ] **Step 2: Run the new test to verify it fails**

Run (from `/Users/sigey/Documents/Projects/NFL_Predictor`): `pytest tests/test_api_routes.py::test_get_player_props_includes_recent_team_and_position -v`
Expected: FAIL — `KeyError: 'recent_team'` (the response dict doesn't have the key yet).

- [ ] **Step 3: Make the one-line fix in NFL_Predictor**

In `NFL_Predictor/src/nfl_predictor/api/routes.py`, change the `results.append(...)` line inside `get_player_props`:

```python
        results.append({
            "player_id": player["player_id"],
            "player_name": player["player_name"],
            "recent_team": player["recent_team"],
            "position": player["position"],
            **props,
        })
```

- [ ] **Step 4: Run the full NFL_Predictor test suite**

Run (from `/Users/sigey/Documents/Projects/NFL_Predictor`): `pytest tests/ -v`
Expected: all tests PASS, including the new one and every pre-existing test (confirms the additive change broke nothing else).

- [ ] **Step 5: Commit in the NFL_Predictor repo**

```bash
cd /Users/sigey/Documents/Projects/NFL_Predictor
git add src/nfl_predictor/api/routes.py tests/test_api_routes.py
git commit -m "feat: include recent_team and position in player props response"
```

- [ ] **Step 6: Confirm the current CFB_Predictor code and write the failing test**

Current code at `CFB_Predictor/src/cfb_predictor/api/routes.py:206-223`:

```python
@router.get("/players/{season}/{week}/props")
def get_player_props(season: int, week: int):
    models = _load_models_or_503()
    player_history = _load_player_history(season)

    latest_players = (
        player_history[player_history["season"] == season]
        [["player_id", "player_name", "position", "recent_team"]]
        .drop_duplicates("player_id")
    )
    results = []
    for _, player in latest_players.iterrows():
        feature_row = player_usage.build_features_for_player(player["player_id"], player_history)
        if feature_row is None:
            continue
        props = player_props.predict_props(models["player_models"], feature_row, position=player["position"])
        results.append({"player_id": player["player_id"], "player_name": player["player_name"], **props})
    return results
```

Add this test to the end of `/Users/sigey/Documents/Projects/CFB_Predictor/tests/test_api_routes.py` (also the first test in this file covering this route):

```python
def test_get_player_props_includes_recent_team_and_position(client, monkeypatch):
    monkeypatch.setattr(
        routes, "_load_player_history",
        lambda season: pd.DataFrame(
            [{"player_id": "cfb-001", "player_name": "Quinn Ewers", "position": "QB",
              "recent_team": "Texas", "season": season}]
        ),
    )
    monkeypatch.setattr(
        routes.player_usage, "build_features_for_player",
        lambda player_id, history: pd.Series({"dummy_feature": 1.0}),
    )
    monkeypatch.setattr(
        routes.player_props, "predict_props",
        lambda player_models, feature_row, position: {"anytime_td_prob": 0.37, "passing_yards": 260.0},
    )

    response = client.get("/api/players/2025/1/props")

    assert response.status_code == 200
    body = response.json()
    assert body[0]["recent_team"] == "Texas"
    assert body[0]["position"] == "QB"
```

- [ ] **Step 7: Run the new test to verify it fails**

Run (from `/Users/sigey/Documents/Projects/CFB_Predictor`): `pytest tests/test_api_routes.py::test_get_player_props_includes_recent_team_and_position -v`
Expected: FAIL — `KeyError: 'recent_team'`.

- [ ] **Step 8: Make the one-line fix in CFB_Predictor**

In `CFB_Predictor/src/cfb_predictor/api/routes.py`, change the `results.append(...)` line inside `get_player_props`:

```python
        results.append({
            "player_id": player["player_id"],
            "player_name": player["player_name"],
            "recent_team": player["recent_team"],
            "position": player["position"],
            **props,
        })
```

- [ ] **Step 9: Run the full CFB_Predictor test suite**

Run (from `/Users/sigey/Documents/Projects/CFB_Predictor`): `pytest tests/ -v`
Expected: all tests PASS, including the new one and every pre-existing test.

- [ ] **Step 10: Commit in the CFB_Predictor repo**

```bash
cd /Users/sigey/Documents/Projects/CFB_Predictor
git add src/cfb_predictor/api/routes.py tests/test_api_routes.py
git commit -m "feat: include recent_team and position in player props response"
```

---

## Task 2: Scaffold the Vite + React + TypeScript + Tailwind project, with Vitest testing configured

Note: none of the three reference frontends (`PL_Predictor`, `NFL_Predictor`, `CFB_Predictor`) have Vitest configured — their `package.json`s ship no test runner at all. This plan adds `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom` as new devDependencies here since the spec requires component tests and nothing existing provides that tooling.

**Files:**
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/package.json`
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/vite.config.ts`
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/tsconfig.json`
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/tsconfig.app.json`
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/tsconfig.node.json`
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/index.html`
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/src/main.tsx`
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/src/index.css`
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/src/App.tsx` (placeholder, replaced in Task 14)
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/src/test-setup.ts`
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/src/vite-env.d.ts`
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/.gitignore` (extend the existing one with `dist`, already present — verify, don't duplicate)

**Interfaces:**
- Consumes: nothing (first code task).
- Produces: a working `npm run dev`, `npm run build`, and `npm test` in this project; the `--color-sp-*`, `--color-nfl-blue`, `--color-cfb-orange`, `--color-win`, `--color-loss` Tailwind theme tokens every later component references; the `clip-corner` and `animate-modal-in` utility classes Task 10/11 use.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "sports-predictor-frontend",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "react": "^19.2.8",
    "react-dom": "^19.2.8",
    "tailwindcss": "^4.3.3"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/node": "^24.13.3",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.4",
    "jsdom": "^25.0.1",
    "oxlint": "^1.75.0",
    "typescript": "~6.0.2",
    "vite": "^8.2.0",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `vite.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    host: true,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test-setup.ts",
  },
});
```

- [ ] **Step 3: Create `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`**

`tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "Bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Sports Predictor</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create `src/index.css`**

Adapted from `PL_Predictor/frontend/src/index.css`'s Tailwind theme setup, replacing PL's purple/pink "Purple Power" ramp with a deep amber/gold "Amber Field" ramp, and adding the NFL blue / CFB orange secondary-accent tokens the spec calls for. No `--color-draw` token — neither NFL nor CFB has draws, so only `--color-win`/`--color-loss` are needed.

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
@import "tailwindcss";

@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;

  /* Sports Predictor "Amber Field" base — deep amber/gold, distinct from
     PL_Predictor's purple/pink and F1_Predictor's likely palette. */
  --color-sp-950: #150f05;
  --color-sp-900: #241a08;
  --color-sp-850: #30220c;
  --color-sp-800: #3b2a0f;
  --color-sp-700: #523a15;
  --color-sp-600: #6e4d1c;
  --color-sp-500: #96692a;
  --color-sp-border: #4a3714;

  --color-sp-gold: #f2a900;
  --color-sp-gold-soft: #ffc233;
  --color-sp-cyan: #05d1c8;

  --color-sp-text: #f7f2e7;
  --color-sp-text-dim: #cbbfa3;
  --color-sp-text-faint: #93856a;

  /* Secondary per-sport accent, layered over the shared amber base when
     each sport is active — NFL leans cool blue, CFB leans warm orange. */
  --color-nfl-blue: #2e6bd8;
  --color-cfb-orange: #d8571f;

  --color-win: #22c55e;
  --color-loss: #ef4444;
}

html {
  color-scheme: dark;
}

body {
  margin: 0;
  background:
    radial-gradient(circle at 15% -10%, var(--color-sp-700) 0%, transparent 45%),
    radial-gradient(circle at 100% 0%, var(--color-sp-600) 0%, transparent 35%),
    var(--color-sp-950);
  min-height: 100vh;
  color: var(--color-sp-text);
  font-family: var(--font-sans);
}

::selection {
  background: var(--color-sp-gold);
  color: #150f05;
}

/* One clipped corner on cards — carried over from PL_Predictor's card
   styling as a shared structural motif, not a PL-specific mark. */
.clip-corner {
  clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%);
}

.clip-corner-lg {
  clip-path: polygon(0 0, calc(100% - 28px) 0, 100% 28px, 100% 100%, 0 100%);
}

@keyframes modal-in {
  from {
    opacity: 0;
    transform: scale(0.96) translateY(8px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.animate-modal-in {
  animation: modal-in 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}
```

- [ ] **Step 6: Create `src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 7: Create a placeholder `src/App.tsx`** (replaced in full by Task 14)

```tsx
function App() {
  return <div className="p-8 text-sp-text">Sports Predictor — scaffold OK</div>;
}

export default App;
```

- [ ] **Step 8: Create `src/test-setup.ts`**

```typescript
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 9: Create `src/vite-env.d.ts`**

```typescript
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_NFL_API_BASE_URL?: string;
  readonly VITE_CFB_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 10: Confirm `.gitignore` already covers `node_modules/` and `dist/`**

The repo's existing `.gitignore` already has `.venv/`, `__pycache__/`, `node_modules/`, `dist/`, `.env`, `.DS_Store` — no change needed. Verify with `cat /Users/sigey/Documents/Projects/Sports_Predictor/.gitignore`.

- [ ] **Step 11: Install dependencies and verify dev/build/test all run**

```bash
cd /Users/sigey/Documents/Projects/Sports_Predictor
npm install
npm run build
npm test
```

Expected: `npm run build` succeeds (produces `dist/`); `npm test` runs Vitest with zero test files found yet (this is expected — no `*.test.ts(x)` files exist until Task 7) and exits 0.

- [ ] **Step 12: Commit**

```bash
git add package.json vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json index.html src/main.tsx src/index.css src/App.tsx src/test-setup.ts src/vite-env.d.ts package-lock.json
git commit -m "chore: scaffold Vite/React/TS/Tailwind project with Vitest configured"
```

---

## Task 3: Shared `types.ts`

**Files:**
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/src/types.ts`

**Interfaces:**
- Consumes: nothing (pure type definitions).
- Produces: `Sport`, `GameSummary`, `GamePrediction`, `PlayerPropPrediction`, `TrackRecord`, `RetrainResponse`, and `SportApi` — every later task imports its types from this file. `PlayerPropPrediction` includes `recent_team: string` and `position: string`, present now that Task 1 landed on both backends. `GameSummary.spread_line`/`total_line` are optional (`?`) to accommodate CFB's schema, which has neither field.

- [ ] **Step 1: Write `src/types.ts`**

Merged from `NFL_Predictor/frontend/src/types.ts` and `CFB_Predictor/frontend/src/types.ts` (identical except NFL's `GameSummary` has `spread_line`/`total_line`), with `recent_team`/`position` added to `PlayerPropPrediction` per Task 1, and a `SportApi` interface describing the shape both `createApiClient` instances (Task 4) implement:

```typescript
export type Sport = "nfl" | "cfb";

export interface GameSummary {
  game_id: string;
  season: number;
  week: number;
  gameday: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  spread_line?: number | null;
  total_line?: number | null;
}

export interface GamePrediction {
  home_win_prob: number;
  away_win_prob: number;
  home_cover_prob: number | null;
  away_cover_prob: number | null;
  over_prob: number | null;
  under_prob: number | null;
}

export interface PlayerPropPrediction {
  player_id: string;
  player_name: string;
  recent_team: string;
  position: string;
  anytime_td_prob: number;
  passing_yards?: number;
  rushing_yards?: number;
  receiving_yards?: number;
}

export interface TrackRecord {
  n_resolved_games: number;
  pct_moneyline_correct: number | null;
}

export interface RetrainResponse {
  trained_at: string;
  chosen_candidate: string;
}

export interface SportApi {
  games: (season: number, week: number) => Promise<GameSummary[]>;
  gamePrediction: (season: number, week: number, gameId: string) => Promise<GamePrediction>;
  playerProps: (season: number, week: number) => Promise<PlayerPropPrediction[]>;
  trackRecord: () => Promise<TrackRecord>;
  retrain: () => Promise<RetrainResponse>;
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd /Users/sigey/Documents/Projects/Sports_Predictor && npx tsc -b`
Expected: no errors (this file has no runtime logic, just declarations — there's no test to run, `tsc` is the verification).

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared types.ts for GameSummary/GamePrediction/PlayerPropPrediction/SportApi"
```

---

## Task 4: API client factory (`createApiClient` + `nflApi`/`cfbApi`)

**Files:**
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/src/api/client.ts`

**Interfaces:**
- Consumes: `GameSummary`, `GamePrediction`, `PlayerPropPrediction`, `TrackRecord`, `RetrainResponse`, `SportApi` from `../types` (Task 3).
- Produces: `createApiClient(baseUrl: string): SportApi`, and two ready-made instances `nflApi`/`cfbApi`, both `SportApi`-shaped. Task 5 (`SportContext`) consumes `nflApi`/`cfbApi` directly; Task 11 (`GameDetailModal`) and Task 12/13 (pages) consume the `SportApi` type via context, never `createApiClient` directly.

- [ ] **Step 1: Write `src/api/client.ts`**

Adapted from `NFL_Predictor/frontend/src/api/client.ts` and `CFB_Predictor/frontend/src/api/client.ts` (identical `get`/`post` fetch logic in both), refactored into a factory parameterized by `baseUrl` so one module serves both backends instead of two copy-pasted files. Defaults match the spec's local-dev ports; production overrides come from the two `VITE_*_API_BASE_URL` env vars:

```typescript
import type {
  GamePrediction,
  GameSummary,
  PlayerPropPrediction,
  RetrainResponse,
  SportApi,
  TrackRecord,
} from "../types";

export function createApiClient(baseUrl: string): SportApi {
  async function get<T>(path: string): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail ?? `${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  async function post<T>(path: string): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, { method: "POST" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.detail ?? `${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  return {
    games: (season, week) => get<GameSummary[]>(`/games?season=${season}&week=${week}`),
    gamePrediction: (season, week, gameId) =>
      get<GamePrediction>(`/games/${season}/${week}/${gameId}/prediction`),
    playerProps: (season, week) => get<PlayerPropPrediction[]>(`/players/${season}/${week}/props`),
    trackRecord: () => get<TrackRecord>("/track-record"),
    retrain: () => post<RetrainResponse>("/retrain"),
  };
}

const NFL_BASE_URL = import.meta.env.VITE_NFL_API_BASE_URL ?? "http://localhost:8001/api";
const CFB_BASE_URL = import.meta.env.VITE_CFB_API_BASE_URL ?? "http://localhost:8003/api";

export const nflApi = createApiClient(NFL_BASE_URL);
export const cfbApi = createApiClient(CFB_BASE_URL);
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd /Users/sigey/Documents/Projects/Sports_Predictor && npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/api/client.ts
git commit -m "feat: add createApiClient factory with nflApi/cfbApi instances"
```

---

## Task 5: `SportContext` (active-sport state + active API client)

**Files:**
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/src/context/SportContext.tsx`

**Interfaces:**
- Consumes: `Sport` from `../types` (Task 3); `nflApi`, `cfbApi` from `../api/client` (Task 4).
- Produces: `SportProvider` (wraps the app, Task 14), `useSport(): { sport: Sport; setSport: (sport: Sport) => void; api: SportApi }` — every page and `SportToggle` (Tasks 9, 12, 13, 14) calls `useSport()` for the active sport/client.

- [ ] **Step 1: Write `src/context/SportContext.tsx`**

```tsx
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { cfbApi, nflApi } from "../api/client";
import type { Sport, SportApi } from "../types";

interface SportContextValue {
  sport: Sport;
  setSport: (sport: Sport) => void;
  api: SportApi;
}

const SportContext = createContext<SportContextValue | null>(null);

export function SportProvider({ children }: { children: ReactNode }) {
  const [sport, setSport] = useState<Sport>("nfl");
  const value = useMemo<SportContextValue>(
    () => ({ sport, setSport, api: sport === "nfl" ? nflApi : cfbApi }),
    [sport],
  );
  return <SportContext.Provider value={value}>{children}</SportContext.Provider>;
}

export function useSport(): SportContextValue {
  const ctx = useContext(SportContext);
  if (!ctx) throw new Error("useSport must be used within a SportProvider");
  return ctx;
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd /Users/sigey/Documents/Projects/Sports_Predictor && npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/context/SportContext.tsx
git commit -m "feat: add SportContext with SportProvider/useSport"
```

---

## Task 6: Confidence-sort utility, with a real unit test

**Files:**
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/src/lib/confidenceSort.ts`
- Test: `/Users/sigey/Documents/Projects/Sports_Predictor/src/lib/confidenceSort.test.ts`

**Interfaces:**
- Consumes: `GamePrediction`, `GameSummary` from `../types` (Task 3).
- Produces: `sortByConfidence(games: GameSummary[], predictions: Record<string, GamePrediction>): GameSummary[]` — consumed by Task 12's `GamesPage` for its "sort by confidence" control.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { sortByConfidence } from "./confidenceSort";
import type { GamePrediction, GameSummary } from "../types";

function game(id: string): GameSummary {
  return {
    game_id: id,
    season: 2026,
    week: 1,
    gameday: "2026-09-06",
    home_team: "AAA",
    away_team: "BBB",
    home_score: null,
    away_score: null,
  };
}

function prediction(homeWin: number, awayWin: number): GamePrediction {
  return {
    home_win_prob: homeWin,
    away_win_prob: awayWin,
    home_cover_prob: null,
    away_cover_prob: null,
    over_prob: null,
    under_prob: null,
  };
}

describe("sortByConfidence", () => {
  it("sorts games by max(home_win_prob, away_win_prob) descending", () => {
    const games = [game("low"), game("high"), game("mid")];
    const predictions = {
      low: prediction(0.55, 0.45),
      high: prediction(0.2, 0.9),
      mid: prediction(0.7, 0.3),
    };

    const sorted = sortByConfidence(games, predictions);

    expect(sorted.map((g) => g.game_id)).toEqual(["high", "mid", "low"]);
  });

  it("treats a game with no prediction yet as least confident", () => {
    const games = [game("no-pred"), game("has-pred")];
    const predictions = { "has-pred": prediction(0.6, 0.4) };

    const sorted = sortByConfidence(games, predictions);

    expect(sorted.map((g) => g.game_id)).toEqual(["has-pred", "no-pred"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sigey/Documents/Projects/Sports_Predictor && npx vitest run src/lib/confidenceSort.test.ts`
Expected: FAIL — `Cannot find module './confidenceSort'`.

- [ ] **Step 3: Write the implementation**

```typescript
import type { GamePrediction, GameSummary } from "../types";

export function sortByConfidence(
  games: GameSummary[],
  predictions: Record<string, GamePrediction>,
): GameSummary[] {
  const confidence = (game: GameSummary): number => {
    const prediction = predictions[game.game_id];
    if (!prediction) return -1;
    return Math.max(prediction.home_win_prob, prediction.away_win_prob);
  };
  return [...games].sort((a, b) => confidence(b) - confidence(a));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/sigey/Documents/Projects/Sports_Predictor && npx vitest run src/lib/confidenceSort.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/confidenceSort.ts src/lib/confidenceSort.test.ts
git commit -m "feat: add sortByConfidence utility with unit tests"
```

---

## Task 7: `TeamName` component (initial-avatar substitute for PL's `TeamBadge`)

**Files:**
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/src/components/TeamName.tsx`
- Test: `/Users/sigey/Documents/Projects/Sports_Predictor/src/components/TeamName.test.tsx`

**Interfaces:**
- Consumes: nothing (plain string prop).
- Produces: `TeamName({ team, size }: { team: string; size?: "sm" | "md" | "lg" })`, plus the exported helpers `teamColor(team: string): string` and `teamInitial(team: string): string` — consumed by Task 9 (`GameCard`) and Task 10 (`GameDetailModal`).

`PL_Predictor/frontend/src/components/TeamBadge.tsx` doesn't transfer: it does an image-lookup (`teamCrestUrl`) keyed to ~20 known Premier League club names. Neither NFL (32 teams) nor especially CFB (~134 FBS teams) has any crest data source, so this component uses a deterministic color hash and the team name's first letter instead — no image lookup at all.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamName, teamColor, teamInitial } from "./TeamName";

describe("TeamName", () => {
  it("renders the team's name and first-letter initial", () => {
    render(<TeamName team="Kansas City Chiefs" />);
    expect(screen.getByText("Kansas City Chiefs")).toBeInTheDocument();
    expect(screen.getByText("K")).toBeInTheDocument();
  });

  it("derives a deterministic color for the same team name", () => {
    expect(teamColor("Texas")).toBe(teamColor("Texas"));
  });

  it("falls back to ? for an empty team name", () => {
    expect(teamInitial("")).toBe("?");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sigey/Documents/Projects/Sports_Predictor && npx vitest run src/components/TeamName.test.tsx`
Expected: FAIL — `Cannot find module './TeamName'`.

- [ ] **Step 3: Write the implementation**

```tsx
const PALETTE = ["#f2a900", "#2e6bd8", "#d8571f", "#22c55e", "#8b5cf6", "#ec4899", "#05d1c8", "#ef4444"];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function teamColor(team: string): string {
  return PALETTE[hashString(team) % PALETTE.length];
}

export function teamInitial(team: string): string {
  return team.trim().charAt(0).toUpperCase() || "?";
}

const SIZES: Record<"sm" | "md" | "lg", string> = {
  sm: "h-7 w-7 text-[10px]",
  md: "h-10 w-10 text-xs",
  lg: "h-14 w-14 text-sm",
};

export function TeamName({ team, size = "md" }: { team: string; size?: "sm" | "md" | "lg" }) {
  const color = teamColor(team);
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <div
        className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${SIZES[size]}`}
        style={{
          background: `linear-gradient(135deg, ${color}, ${color}cc)`,
          boxShadow: `0 0 0 1px rgba(255,255,255,0.08), 0 2px 8px -2px ${color}88`,
        }}
        title={team}
      >
        {teamInitial(team)}
      </div>
      <span className="text-xs font-semibold leading-tight text-sp-text">{team}</span>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/sigey/Documents/Projects/Sports_Predictor && npx vitest run src/components/TeamName.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/TeamName.tsx src/components/TeamName.test.tsx
git commit -m "feat: add TeamName initial-avatar component"
```

---

## Task 8: `ProbabilityBar` and `MarketBar` (two-outcome adaptations)

**Files:**
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/src/components/ProbabilityBar.tsx`
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/src/components/MarketBar.tsx`

**Interfaces:**
- Consumes: nothing (plain numeric/string props).
- Produces: `ProbabilityBar({ home, away, homeLabel?, awayLabel? }: { home: number; away: number; homeLabel?: string; awayLabel?: string })` — consumed by Task 9 (`GameCard`). `MarketBar({ label, prob }: { label: ReactNode; prob: number })` — consumed by Task 10 (`GameDetailModal`).

`PL_Predictor/frontend/src/components/ProbabilityBar.tsx` is a three-segment home/draw/away bar; NFL and CFB have no draws, so this version drops the draw segment entirely (two segments, home + away, summing to ~100%). `PL_Predictor/frontend/src/components/MarketBar.tsx` also renders a live-market comparison line, a "Value" badge, and hit/miss/model-call highlight rings tied to PL's live-odds and value-bet-tracking features — none of which exist in this app's scope (no odds key configured, value bets explicitly out of scope per the spec), so this version keeps only the model-probability bar itself.

- [ ] **Step 1: Write `src/components/ProbabilityBar.tsx`**

```tsx
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
        <span>
          {homeLabel} <span className="font-mono text-sp-text">{pct(home)}</span>
        </span>
        <span>
          {awayLabel} <span className="font-mono text-sp-text">{pct(away)}</span>
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `src/components/MarketBar.tsx`**

```tsx
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
```

- [ ] **Step 3: Verify it type-checks**

Run: `cd /Users/sigey/Documents/Projects/Sports_Predictor && npx tsc -b`
Expected: no errors. (No dedicated test file for these two — they're pure presentational components with no branching logic; they're exercised indirectly through Task 9's and Task 10's own tests.)

- [ ] **Step 4: Commit**

```bash
git add src/components/ProbabilityBar.tsx src/components/MarketBar.tsx
git commit -m "feat: add two-outcome ProbabilityBar and simplified MarketBar"
```

---

## Task 9: `GameCard` and `ConfidenceBadge` components, with tests

**Files:**
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/src/components/ConfidenceBadge.tsx`
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/src/components/GameCard.tsx`
- Test: `/Users/sigey/Documents/Projects/Sports_Predictor/src/components/GameCard.test.tsx`

**Interfaces:**
- Consumes: `GameSummary`, `GamePrediction` from `../types` (Task 3); `TeamName` from `./TeamName` (Task 7); `ProbabilityBar` from `./ProbabilityBar` (Task 8).
- Produces: `ConfidenceBadge({ homeWinProb, awayWinProb }: { homeWinProb: number; awayWinProb: number })`. `GameCard({ game, prediction, onClick }: { game: GameSummary; prediction: GamePrediction | null; onClick: () => void })` — consumed by Task 12's `GamesPage`.

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GameCard } from "./GameCard";
import type { GamePrediction, GameSummary } from "../types";

const game: GameSummary = {
  game_id: "2026_01_KC_BAL",
  season: 2026,
  week: 1,
  gameday: "2026-09-07T20:00:00Z",
  home_team: "Ravens",
  away_team: "Chiefs",
  home_score: null,
  away_score: null,
  spread_line: -2.5,
  total_line: 46.5,
};

const prediction: GamePrediction = {
  home_win_prob: 0.62,
  away_win_prob: 0.38,
  home_cover_prob: 0.55,
  away_cover_prob: 0.45,
  over_prob: 0.5,
  under_prob: 0.5,
};

describe("GameCard", () => {
  it("renders both team names and the confidence badge", () => {
    render(<GameCard game={game} prediction={prediction} onClick={() => {}} />);
    expect(screen.getByText("Ravens")).toBeInTheDocument();
    expect(screen.getByText("Chiefs")).toBeInTheDocument();
    expect(screen.getByText("62% confident")).toBeInTheDocument();
  });

  it("shows a loading state instead of crashing when the prediction has not arrived yet", () => {
    render(<GameCard game={game} prediction={null} onClick={() => {}} />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<GameCard game={game} prediction={prediction} onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("omits the spread/total line when the game has none (CFB shape)", () => {
    const cfbGame: GameSummary = { ...game, spread_line: undefined, total_line: undefined };
    render(<GameCard game={cfbGame} prediction={prediction} onClick={() => {}} />);
    expect(screen.queryByText(/Spread/)).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sigey/Documents/Projects/Sports_Predictor && npx vitest run src/components/GameCard.test.tsx`
Expected: FAIL — `Cannot find module './GameCard'`.

- [ ] **Step 3: Write `src/components/ConfidenceBadge.tsx`**

```tsx
export function ConfidenceBadge({
  homeWinProb,
  awayWinProb,
}: {
  homeWinProb: number;
  awayWinProb: number;
}) {
  const confidence = Math.max(homeWinProb, awayWinProb);
  const pct = Math.round(confidence * 100);
  const tone =
    confidence >= 0.7
      ? "bg-win/20 text-win"
      : confidence >= 0.55
        ? "bg-sp-gold/20 text-sp-gold"
        : "bg-sp-700/60 text-sp-text-dim";
  return <span className={`rounded px-1.5 py-0.5 font-semibold ${tone}`}>{pct}% confident</span>;
}
```

- [ ] **Step 4: Write `src/components/GameCard.tsx`**

Adapted from `PL_Predictor/frontend/src/components/CurrentGameweekCard.tsx`'s compact-tile structure (kickoff header row, team row, probability bar), dropping PL's value-bet-flag ring and "Model only"/"Upcoming" status badges (no live odds in this app) and swapping `TeamBadge` for `TeamName`:

```tsx
import type { GamePrediction, GameSummary } from "../types";
import { TeamName } from "./TeamName";
import { ProbabilityBar } from "./ProbabilityBar";
import { ConfidenceBadge } from "./ConfidenceBadge";

function formatKickoff(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }),
    time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
  };
}

export function GameCard({
  game,
  prediction,
  onClick,
}: {
  game: GameSummary;
  prediction: GamePrediction | null;
  onClick: () => void;
}) {
  const { date, time } = formatKickoff(game.gameday);

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className="clip-corner flex cursor-pointer flex-col gap-3 rounded-xl border border-sp-border bg-sp-850/70 p-4 transition hover:border-sp-gold/40"
    >
      <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-sp-text-faint">
        <span>
          {date} &middot; {time}
        </span>
        {prediction ? (
          <ConfidenceBadge homeWinProb={prediction.home_win_prob} awayWinProb={prediction.away_win_prob} />
        ) : (
          <span className="rounded bg-sp-700/60 px-1.5 py-0.5 text-sp-text-dim">Loading…</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1">
          <TeamName team={game.away_team} />
        </div>
        <span className="px-1 text-xs font-medium uppercase text-sp-text-faint">at</span>
        <div className="flex-1">
          <TeamName team={game.home_team} />
        </div>
      </div>
      {prediction ? (
        <ProbabilityBar
          home={prediction.home_win_prob}
          away={prediction.away_win_prob}
          homeLabel={game.home_team}
          awayLabel={game.away_team}
        />
      ) : (
        <div className="h-2.5 w-full animate-pulse rounded-full bg-sp-850" />
      )}
      {game.spread_line != null && (
        <p className="text-[11px] text-sp-text-faint">
          Spread {game.spread_line} · Total {game.total_line ?? "—"}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd /Users/sigey/Documents/Projects/Sports_Predictor && npx vitest run src/components/GameCard.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/ConfidenceBadge.tsx src/components/GameCard.tsx src/components/GameCard.test.tsx
git commit -m "feat: add GameCard and ConfidenceBadge components"
```

---

## Task 10: `GameDetailModal` — the flagship combined match+player-props view

**Files:**
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/src/components/GameDetailModal.tsx`
- Test: `/Users/sigey/Documents/Projects/Sports_Predictor/src/components/GameDetailModal.test.tsx`

**Interfaces:**
- Consumes: `GamePrediction`, `GameSummary`, `PlayerPropPrediction`, `SportApi` from `../types` (Task 3); `TeamName` from `./TeamName` (Task 7); `MarketBar` from `./MarketBar` (Task 8).
- Produces: `filterPlayerPropsForGame(props: PlayerPropPrediction[], game: Pick<GameSummary, "home_team" | "away_team">): PlayerPropPrediction[]` (exported for direct unit testing) and `GameDetailModal({ game, api, onClose }: { game: GameSummary; api: SportApi; onClose: () => void })` — consumed by Task 12's `GamesPage`, which passes it the active `SportApi` instance from `useSport()`.

This is the single most important UX requirement from the spec: full match markets and that game's player props together in one view. The player-prop-to-game join has no `game_id` on either side — it's derived by matching `PlayerPropPrediction.recent_team` against the game's `home_team`/`away_team`, which only works now that Task 1 added `recent_team` to the API response. Per the spec's Testing section, this filtering logic gets a real, focused unit test — it is the area "most likely to silently show wrong data if the join is wrong."

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { filterPlayerPropsForGame, GameDetailModal } from "./GameDetailModal";
import type { GamePrediction, GameSummary, PlayerPropPrediction, SportApi } from "../types";

const game: GameSummary = {
  game_id: "2026_01_KC_BAL",
  season: 2026,
  week: 1,
  gameday: "2026-09-07T20:00:00Z",
  home_team: "Ravens",
  away_team: "Chiefs",
  home_score: null,
  away_score: null,
};

function prop(id: string, team: string): PlayerPropPrediction {
  return { player_id: id, player_name: id, recent_team: team, position: "WR", anytime_td_prob: 0.3 };
}

describe("filterPlayerPropsForGame", () => {
  it("keeps only props whose recent_team matches the game's home or away team", () => {
    const props = [prop("a", "Ravens"), prop("b", "Chiefs"), prop("c", "Bengals")];
    expect(filterPlayerPropsForGame(props, game).map((p) => p.player_id)).toEqual(["a", "b"]);
  });

  it("returns an empty list when no prop matches either team", () => {
    const props = [prop("a", "Bengals")];
    expect(filterPlayerPropsForGame(props, game)).toEqual([]);
  });
});

describe("GameDetailModal", () => {
  it("shows only this game's player props once both fetches resolve", async () => {
    const prediction: GamePrediction = {
      home_win_prob: 0.6,
      away_win_prob: 0.4,
      home_cover_prob: null,
      away_cover_prob: null,
      over_prob: null,
      under_prob: null,
    };
    const api: SportApi = {
      games: vi.fn(),
      gamePrediction: vi.fn().mockResolvedValue(prediction),
      playerProps: vi.fn().mockResolvedValue([prop("home-player", "Ravens"), prop("other-game-player", "Bengals")]),
      trackRecord: vi.fn(),
      retrain: vi.fn(),
    };

    render(<GameDetailModal game={game} api={api} onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText("home-player")).toBeInTheDocument());
    expect(screen.queryByText("other-game-player")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sigey/Documents/Projects/Sports_Predictor && npx vitest run src/components/GameDetailModal.test.tsx`
Expected: FAIL — `Cannot find module './GameDetailModal'`.

- [ ] **Step 3: Write the implementation**

Structural pattern adapted from `PL_Predictor/frontend/src/components/FixtureModal.tsx` (modal shell: fixed-position backdrop with blur, close button, `overflow-y-auto` scroll body, Escape-key handling, `animate-modal-in`) — deliberately not pulling in PL-specific sections (scoreline heatmap, head-to-head, post-match review, value bets), since none of those exist in NFL/CFB's data:

```tsx
import { useEffect, useState } from "react";
import type { GamePrediction, GameSummary, PlayerPropPrediction, SportApi } from "../types";
import { TeamName } from "./TeamName";
import { MarketBar } from "./MarketBar";

export function filterPlayerPropsForGame(
  props: PlayerPropPrediction[],
  game: Pick<GameSummary, "home_team" | "away_team">,
): PlayerPropPrediction[] {
  return props.filter(
    (prop) => prop.recent_team === game.home_team || prop.recent_team === game.away_team,
  );
}

interface Props {
  game: GameSummary;
  api: SportApi;
  onClose: () => void;
}

export function GameDetailModal({ game, api, onClose }: Props) {
  const [prediction, setPrediction] = useState<GamePrediction | null>(null);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [allProps, setAllProps] = useState<PlayerPropPrediction[] | null>(null);
  const [propsError, setPropsError] = useState<string | null>(null);
  const [propsLoading, setPropsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setPrediction(null);
    setPredictionError(null);
    setAllProps(null);
    setPropsError(null);
    setPropsLoading(true);

    api
      .gamePrediction(game.season, game.week, game.game_id)
      .then((result) => {
        if (!cancelled) setPrediction(result);
      })
      .catch((err) => {
        if (!cancelled) setPredictionError(err instanceof Error ? err.message : String(err));
      });

    api
      .playerProps(game.season, game.week)
      .then((result) => {
        if (!cancelled) setAllProps(result);
      })
      .catch((err) => {
        if (!cancelled) setPropsError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setPropsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [api, game.season, game.week, game.game_id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const gameProps = allProps ? filterPlayerPropsForGame(allProps, game) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-modal-in relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-sp-border bg-sp-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-sp-border px-6 py-4">
          <span className="text-sm font-semibold text-sp-text-dim">Game detail</span>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-sp-text-dim transition hover:bg-sp-800 hover:text-sp-text"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-6">
          <div className="flex items-center justify-center gap-10">
            <TeamName team={game.away_team} size="lg" />
            <span className="text-2xl font-black text-sp-text-faint">at</span>
            <TeamName team={game.home_team} size="lg" />
          </div>

          <section className="mt-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sp-text-faint">Match markets</h3>
            {predictionError && <p className="text-xs text-loss">{predictionError}</p>}
            {!prediction && !predictionError && (
              <p className="text-xs text-sp-text-faint">Loading match markets…</p>
            )}
            {prediction && (
              <div className="flex flex-col gap-1.5">
                <MarketBar label={`${game.home_team} win`} prob={prediction.home_win_prob} />
                <MarketBar label={`${game.away_team} win`} prob={prediction.away_win_prob} />
                {prediction.home_cover_prob != null && (
                  <MarketBar label={`${game.home_team} covers`} prob={prediction.home_cover_prob} />
                )}
                {prediction.away_cover_prob != null && (
                  <MarketBar label={`${game.away_team} covers`} prob={prediction.away_cover_prob} />
                )}
                {prediction.over_prob != null && <MarketBar label="Over" prob={prediction.over_prob} />}
                {prediction.under_prob != null && <MarketBar label="Under" prob={prediction.under_prob} />}
              </div>
            )}
          </section>

          <section className="mt-6">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-sp-text-faint">Player props</h3>
            {propsError && <p className="text-xs text-loss">{propsError}</p>}
            {propsLoading && (
              <p className="text-xs text-sp-text-faint">Loading player props (can take up to ~15s)…</p>
            )}
            {!propsLoading && !propsError && gameProps && gameProps.length === 0 && (
              <p className="text-xs text-sp-text-faint">No player props available yet for this game.</p>
            )}
            {gameProps && gameProps.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {gameProps.map((prop) => (
                  <div
                    key={prop.player_id}
                    className="flex items-center justify-between rounded-lg bg-sp-850/60 px-3 py-2 text-sm"
                  >
                    <span className="text-sp-text">
                      {prop.player_name}{" "}
                      <span className="text-xs text-sp-text-faint">
                        ({prop.position} · {prop.recent_team})
                      </span>
                    </span>
                    <div className="flex items-center gap-3 font-mono text-xs text-sp-text-dim">
                      <span>TD {Math.round(prop.anytime_td_prob * 100)}%</span>
                      {prop.passing_yards != null && <span>Pass {Math.round(prop.passing_yards)}yd</span>}
                      {prop.rushing_yards != null && <span>Rush {Math.round(prop.rushing_yards)}yd</span>}
                      {prop.receiving_yards != null && <span>Rec {Math.round(prop.receiving_yards)}yd</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/sigey/Documents/Projects/Sports_Predictor && npx vitest run src/components/GameDetailModal.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/GameDetailModal.tsx src/components/GameDetailModal.test.tsx
git commit -m "feat: add GameDetailModal with match markets and player-prop filtering"
```

---

## Task 11: `GamesPage` — wires games grid, confidence sort, and the detail modal together

**Files:**
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/src/pages/GamesPage.tsx`

**Interfaces:**
- Consumes: `GamePrediction`, `GameSummary` from `../types` (Task 3); `useSport` from `../context/SportContext` (Task 5); `sortByConfidence` from `../lib/confidenceSort` (Task 6); `GameCard` from `../components/GameCard` (Task 9); `GameDetailModal` from `../components/GameDetailModal` (Task 10).
- Produces: `GamesPage()` — a page component with no props, consumed by Task 14's `App.tsx`.

Fetch pattern adapted from both `NFL_Predictor/frontend/src/pages/GamesPage.tsx` and `CFB_Predictor/frontend/src/pages/GamesPage.tsx` (identical: fetch the week's games, then `Promise.all` one `gamePrediction` fetch per game, tolerating per-game failure) — restyled and driven by `useSport()`'s active client instead of a single hardcoded `api` import, with the new sort-mode toggle and click-through to `GameDetailModal`.

- [ ] **Step 1: Write `src/pages/GamesPage.tsx`**

```tsx
import { useEffect, useState } from "react";
import type { GamePrediction, GameSummary } from "../types";
import { useSport } from "../context/SportContext";
import { sortByConfidence } from "../lib/confidenceSort";
import { GameCard } from "../components/GameCard";
import { GameDetailModal } from "../components/GameDetailModal";

const SEASON = 2026;
const WEEK = 1;

type SortMode = "chronological" | "confidence";

export function GamesPage() {
  const { api, sport } = useSport();
  const [games, setGames] = useState<GameSummary[]>([]);
  const [predictions, setPredictions] = useState<Record<string, GamePrediction>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("chronological");
  const [selectedGame, setSelectedGame] = useState<GameSummary | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setGames([]);
    setPredictions({});
    setSelectedGame(null);

    api
      .games(SEASON, WEEK)
      .then(async (fetchedGames) => {
        setGames(fetchedGames);
        const entries = await Promise.all(
          fetchedGames.map(async (g) => {
            try {
              const prediction = await api.gamePrediction(SEASON, WEEK, g.game_id);
              return [g.game_id, prediction] as const;
            } catch {
              return null;
            }
          }),
        );
        setPredictions(Object.fromEntries(entries.filter((e): e is [string, GamePrediction] => e !== null)));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [api, sport]);

  const orderedGames =
    sortMode === "confidence"
      ? sortByConfidence(games, predictions)
      : [...games].sort((a, b) => new Date(a.gameday).getTime() - new Date(b.gameday).getTime());

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-bold text-sp-text">Week {WEEK} Games</h2>
        <div className="flex gap-1 rounded-lg border border-sp-border bg-sp-850/60 p-1">
          {(["chronological", "confidence"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setSortMode(mode)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                sortMode === mode ? "bg-sp-gold text-sp-950" : "text-sp-text-dim hover:text-sp-text"
              }`}
            >
              {mode === "chronological" ? "Kickoff order" : "Sort by confidence"}
            </button>
          ))}
        </div>
      </div>

      {loading && <p className="text-sm text-sp-text-faint">Loading…</p>}
      {error && (
        <p role="alert" className="text-sm text-loss">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {orderedGames.map((game) => (
          <GameCard
            key={game.game_id}
            game={game}
            prediction={predictions[game.game_id] ?? null}
            onClick={() => setSelectedGame(game)}
          />
        ))}
      </div>

      {selectedGame && <GameDetailModal game={selectedGame} api={api} onClose={() => setSelectedGame(null)} />}
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd /Users/sigey/Documents/Projects/Sports_Predictor && npx tsc -b`
Expected: no errors. (No dedicated test file — this page composes already-tested units; its own live-data behavior is verified in Task 15's manual browser pass, per the spec's Testing section, which calls for a manual browser pass rather than a mocked-fetch test for whole-page wiring.)

- [ ] **Step 3: Commit**

```bash
git add src/pages/GamesPage.tsx
git commit -m "feat: add GamesPage wiring GameCard/GameDetailModal/confidence sort"
```

---

## Task 12: `TrackRecordPage` — per-sport, adapted from the existing simple scaffold

**Files:**
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/src/pages/TrackRecordPage.tsx`

**Interfaces:**
- Consumes: `TrackRecord` from `../types` (Task 3); `useSport` from `../context/SportContext` (Task 5).
- Produces: `TrackRecordPage()` — a page component with no props, consumed by Task 14's `App.tsx`.

- [ ] **Step 1: Write `src/pages/TrackRecordPage.tsx`**

Adapted from `NFL_Predictor/frontend/src/pages/TrackRecordPage.tsx` and `CFB_Predictor/frontend/src/pages/TrackRecordPage.tsx` (identical), restyled and driven by `useSport()`'s active client so it re-fetches whenever the active sport changes:

```tsx
import { useEffect, useState } from "react";
import type { TrackRecord } from "../types";
import { useSport } from "../context/SportContext";

export function TrackRecordPage() {
  const { api, sport } = useSport();
  const [record, setRecord] = useState<TrackRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRecord(null);
    setError(null);
    api
      .trackRecord()
      .then(setRecord)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [api, sport]);

  return (
    <div>
      <h2 className="mb-4 text-lg font-bold text-sp-text">Track Record</h2>
      {error && (
        <p role="alert" className="text-sm text-loss">
          {error}
        </p>
      )}
      {!record && !error && <p className="text-sm text-sp-text-faint">Loading…</p>}
      {record && (
        <div className="flex flex-col gap-2 rounded-xl border border-sp-border bg-sp-850/70 p-4">
          <p className="text-sm text-sp-text-dim">
            Resolved games: <span className="font-semibold text-sp-text">{record.n_resolved_games}</span>
          </p>
          <p className="text-sm text-sp-text-dim">
            Moneyline accuracy:{" "}
            <span className="font-semibold text-sp-text">
              {record.pct_moneyline_correct != null
                ? `${Math.round(record.pct_moneyline_correct * 100)}%`
                : "No resolved games yet"}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `cd /Users/sigey/Documents/Projects/Sports_Predictor && npx tsc -b`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/TrackRecordPage.tsx
git commit -m "feat: add per-sport TrackRecordPage"
```

---

## Task 13: `SportToggle` component (with a test) and the `App` shell

**Files:**
- Create: `/Users/sigey/Documents/Projects/Sports_Predictor/src/components/SportToggle.tsx`
- Test: `/Users/sigey/Documents/Projects/Sports_Predictor/src/components/SportToggle.test.tsx`
- Modify: `/Users/sigey/Documents/Projects/Sports_Predictor/src/App.tsx` (replaces Task 2's placeholder)

**Interfaces:**
- Consumes: `Sport` from `../types` (Task 3); `useSport`, `SportProvider` from `../context/SportContext` (Task 5); `GamesPage` from `./pages/GamesPage` (Task 11); `TrackRecordPage` from `./pages/TrackRecordPage` (Task 12).
- Produces: `SportToggle()` and the default-exported `App` component — the final top-level entry point `main.tsx` (Task 2) renders.

- [ ] **Step 1: Write the failing test for `SportToggle`**

```tsx
import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SportToggle } from "./SportToggle";
import { SportProvider, useSport } from "../context/SportContext";

function ActiveSportLabel() {
  const { sport } = useSport();
  return <span data-testid="active-sport">{sport}</span>;
}

describe("SportToggle", () => {
  it("switches the active sport in SportContext when clicked", () => {
    render(
      <SportProvider>
        <SportToggle />
        <ActiveSportLabel />
      </SportProvider>,
    );

    expect(screen.getByTestId("active-sport")).toHaveTextContent("nfl");
    fireEvent.click(screen.getByText("CFB"));
    expect(screen.getByTestId("active-sport")).toHaveTextContent("cfb");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/sigey/Documents/Projects/Sports_Predictor && npx vitest run src/components/SportToggle.test.tsx`
Expected: FAIL — `Cannot find module './SportToggle'`.

- [ ] **Step 3: Write `src/components/SportToggle.tsx`**

```tsx
import { useSport } from "../context/SportContext";
import type { Sport } from "../types";

const SPORTS: { key: Sport; label: string }[] = [
  { key: "nfl", label: "NFL" },
  { key: "cfb", label: "CFB" },
];

export function SportToggle() {
  const { sport, setSport } = useSport();
  return (
    <div className="flex gap-1 rounded-lg border border-sp-border bg-sp-850/60 p-1">
      {SPORTS.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => setSport(key)}
          className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
            sport === key
              ? key === "nfl"
                ? "bg-nfl-blue text-white"
                : "bg-cfb-orange text-white"
              : "text-sp-text-dim hover:text-sp-text"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/sigey/Documents/Projects/Sports_Predictor && npx vitest run src/components/SportToggle.test.tsx`
Expected: PASS (1 test).

- [ ] **Step 5: Replace `src/App.tsx`'s placeholder with the full app shell**

Nav/routing pattern adapted from `PL_Predictor/frontend/src/App.tsx` (header with logo mark + title, tab nav switching which page is shown), with `SportToggle` added next to the page-tab nav and the PL-specific "PL" logo mark/purple gradient swapped for "SP"/amber:

```tsx
import { useState } from "react";
import { SportProvider, useSport } from "./context/SportContext";
import { SportToggle } from "./components/SportToggle";
import { GamesPage } from "./pages/GamesPage";
import { TrackRecordPage } from "./pages/TrackRecordPage";

type Tab = "games" | "track-record";

function AppShell() {
  const [tab, setTab] = useState<Tab>("games");
  const { sport } = useSport();

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-6 py-8" data-sport={sport}>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="clip-corner flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-sp-gold to-sp-600 font-black text-sp-950">
            SP
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-sp-text">Sports Predictor</h1>
            <p className="text-xs text-sp-text-faint">NFL &amp; CFB game and player predictions</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SportToggle />
          <nav className="flex gap-1 rounded-lg border border-sp-border bg-sp-850/60 p-1">
            {(
              [
                ["games", "Games"],
                ["track-record", "Track Record"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
                  tab === key ? "bg-sp-gold text-sp-950" : "text-sp-text-dim hover:text-sp-text"
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main>{tab === "games" ? <GamesPage /> : <TrackRecordPage />}</main>
    </div>
  );
}

function App() {
  return (
    <SportProvider>
      <AppShell />
    </SportProvider>
  );
}

export default App;
```

- [ ] **Step 6: Verify it type-checks and the whole test suite passes**

Run: `cd /Users/sigey/Documents/Projects/Sports_Predictor && npx tsc -b && npm test`
Expected: no type errors; all Vitest suites PASS (`confidenceSort`, `TeamName`, `GameCard`, `GameDetailModal`, `SportToggle`).

- [ ] **Step 7: Commit**

```bash
git add src/components/SportToggle.tsx src/components/SportToggle.test.tsx src/App.tsx
git commit -m "feat: add SportToggle and wire up the full App shell"
```

---

## Task 14: Manual verification against both real running backends, including the player-props bug diagnosis

**Files:** none created — this task runs the app and both backends, observes real behavior, and (if a real bug is found) makes a small, justified fix to whichever file listed in Tasks 1-13 actually needs it.

**Interfaces:**
- Consumes: the fully wired app from Task 13; both backends' real, running APIs.
- Produces: a confirmed-working app against real data, and — if the player-props complaint reproduces — a documented root-cause fix.

The spec confirms CFB's backend itself returns real data (`GET /api/players/2026/1/props` → 339KB, real predictions, ~11s response time) — so "player props don't show up" is very likely a frontend-side issue (e.g., no loading affordance for an 11-second fetch reading as "broken", or a silently swallowed fetch error), not a backend defect. This task confirms the actual cause against the real running app rather than guessing.

Note: Task 10's `GameDetailModal` already renders a "Loading player props (can take up to ~15s)…" message during the fetch and separately renders `propsError` if the fetch rejects — if the real bug turns out to be exactly the missing-loading-affordance problem the spec anticipates, that may already be handled; this task's job is to confirm that empirically against the real backend, not assume it.

- [ ] **Step 1: Start the NFL backend**

Run (in its own terminal/background process, from `/Users/sigey/Documents/Projects/NFL_Predictor`): whatever command that project's own README/`main.py` doc-comment specifies for local dev (matching the spec's "NFL at :8001" — confirm the exact run command from that project's own docs before starting it, since this plan doesn't duplicate that project's own startup instructions).

Expected: NFL backend serving on `http://localhost:8001`.

- [ ] **Step 2: Start the CFB backend**

Run (in its own terminal/background process, from `/Users/sigey/Documents/Projects/CFB_Predictor`): whatever command that project's own README/`main.py` doc-comment specifies for local dev (matching the spec's "CFB at :8003").

Expected: CFB backend serving on `http://localhost:8003`.

- [ ] **Step 3: Start the frontend dev server**

```bash
cd /Users/sigey/Documents/Projects/Sports_Predictor
npm run dev
```

Expected: Vite dev server serving on `http://localhost:5174`.

- [ ] **Step 4: Open the app in a real browser and confirm the games grid loads for both sports**

Open `http://localhost:5174`. Confirm the NFL games grid loads (week 1, 2026 season) with real team names and win probabilities. Click the CFB toggle button; confirm the grid re-fetches and shows CFB's real week-1 games with a different team roster (no PL/NFL data bleeding through). Confirm the CFB toggle's active-state color reads visibly orange and the NFL toggle's reads visibly blue, per the spec's per-sport secondary-accent requirement.

- [ ] **Step 5: Confirm a game's modal shows both match markets and its own filtered player props**

Click any game card. Confirm the modal opens showing: both teams' names, the match markets section populated with real win/cover/total probabilities from that backend, and (once the ~11s fetch resolves) a player-props section listing only players from the two teams in that specific game — not the full week's roster. Cross-check a couple of listed players' `recent_team` values against the game's `home_team`/`away_team` to confirm the join is correct against real data, not just the mocked test from Task 10.

- [ ] **Step 6: Re-test the "player props don't show up" complaint specifically, in the real browser**

Open the browser's network tab (or devtools console) while opening a CFB game's modal. Watch the `GET /api/players/2026/1/props` request through its full ~11s lifecycle. Determine which of these it actually is:
  (a) the request succeeds but the UI's loading state was insufficient (fixed already by Task 10's explicit ~15s loading message — confirm this reads clearly during the real 11s wait, not just briefly), or
  (b) the request throws and the error is silently swallowed somewhere (check `propsError` actually renders if you simulate a failure, e.g., by temporarily stopping the CFB backend mid-request), or
  (c) something else entirely (a CORS preflight issue, a response-shape mismatch, a slow initial games-grid render blocking the props fetch from ever starting, etc.).

Document which of these it was directly in this step's checkbox notes when executing this task (do not guess blindly — confirm against the real backend's real response, per the spec's explicit instruction).

- [ ] **Step 7: If a real bug was found, fix it and add a regression test if the fix is unit-testable**

If Step 6 finds an actual frontend bug (not just "the fix already in Task 10 is correct"), make the smallest correct fix to the specific file responsible (most likely `src/components/GameDetailModal.tsx` or `src/pages/GamesPage.tsx`), and add a unit test alongside the existing test file for that component covering the specific failure mode found. Do not speculate about hypothetical bugs not actually observed in Step 6 — only fix what Step 6 actually surfaced.

- [ ] **Step 8: Confirm NFL's separately-diagnosed empty-player-props case degrades gracefully**

Per the spec, NFL's player props returning empty is a different, already-diagnosed, out-of-scope issue (nflverse hasn't published 2025/2026 season player stats yet). Open an NFL game's modal and confirm the UI shows "No player props available yet for this game." (Task 10's existing empty-state message) rather than a blank or broken-looking panel — this requires no code change, just confirmation that the existing empty-state handles it.

- [ ] **Step 9: Run the full test suite one more time**

```bash
cd /Users/sigey/Documents/Projects/Sports_Predictor
npm test
```

Expected: all tests PASS, including any regression test added in Step 7.

- [ ] **Step 10: Commit any fix made in Step 7**

Only run this step if Step 7 made a change:

```bash
git add -A
git commit -m "fix: <describe the actual root cause found in Step 6 and the fix applied>"
```

---

## Task 15: Build verification

**Files:** none created — this task only runs the build.

**Interfaces:**
- Consumes: the complete app from Tasks 1-14.
- Produces: a confirmed clean production build. No deploy in this plan, per the spec's explicit scope boundary — this task verifies the app *builds*, not that it's deployed.

- [ ] **Step 1: Run a clean production build**

```bash
cd /Users/sigey/Documents/Projects/Sports_Predictor
rm -rf dist
npm run build
```

Expected: exits 0, produces a populated `dist/` directory, no TypeScript errors (the build script is `tsc -b && vite build`, so a type error here fails the whole command).

- [ ] **Step 2: Sanity-check the build output**

```bash
ls -la dist
```

Expected: `dist/index.html` and a `dist/assets/` directory with hashed JS/CSS bundle files exist.

- [ ] **Step 3: Run the full test suite one final time**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 4: Commit** (only if Step 1's build produced any tracked-file changes — normally `dist/` is gitignored and there is nothing new to commit; skip committing if `git status` shows no changes)

```bash
git status
```

If clean, no commit needed — this task is verification-only.

---

## Self-Review

**1. Spec coverage:**
- Backend `recent_team`/`position` fix → Task 1 (both repos, both with new tests, both re-running full suites).
- Project layout (`src/api/client.ts`, `src/context/SportContext.tsx`, `src/types.ts`, `src/components/*`, `src/pages/*`, `App.tsx`/`main.tsx`/`index.css`) → Tasks 2-13, file-for-file matching the spec's listed layout.
- Data flow (`Promise.all` per-game predictions, once-per-week player props, browser-side fetch, no proxy) → Tasks 4, 11.
- `SportToggle` (two buttons, resets games list on switch) → Task 13, exercised by `GamesPage`'s `useEffect([api, sport])` dependency in Task 11.
- `GameCard` (compact tile, click-through, sorted by sort mode) → Task 9, wired in Task 11.
- `GameDetailModal` (match markets + filtered player props, the flagship feature) → Task 10, with the specifically-called-out filtering unit test.
- Confidence sort (`max(home_win_prob, away_win_prob)` descending, no live odds needed) → Task 6, with its own unit test, wired into `GamesPage` in Task 11.
- `ConfidenceBadge` → Task 9.
- `TeamName` (initial-avatar substitute) → Task 7.
- Design system (Tailwind, Inter, dark theme, `clip-corner`, modal-with-backdrop-blur, distinct amber/gold accent, NFL blue/CFB orange secondary accents, semantic win/loss coloring) → Task 2 (`index.css`), Task 13 (`SportToggle`'s per-sport button coloring, `App.tsx`'s `data-sport` attribute).
- Testing (Vitest+RTL component tests for `SportToggle`, confidence sort, `GameCard`, `GameDetailModal`'s filtering logic) → Tasks 6, 7, 9, 10, 13, all with real test code, not placeholders.
- Manual browser pass against both real backends, specifically re-testing the player-props complaint → Task 14.
- NFL's separately-diagnosed empty-player-props case degrading gracefully → Task 14, Step 8 (verifies Task 10's existing empty-state message, no new code needed).
- Build verification, no deploy → Task 15.
- Out-of-scope items (PL_Predictor/F1_Predictor untouched, no cross-sport merged track record, no value-bet display, no `predictor-hub` edit, no other backend changes) → none of Tasks 2-15 touch any of these; Task 1 is scoped to exactly the one confirmed field addition and nothing else.

No spec requirement was found without a corresponding task.

**2. Placeholder scan:** Every task's code blocks contain complete, real file contents (not diffs described in prose, not "adapt X" instructions) — checked task-by-task while writing this plan. The one paraphrased "run whatever command the project's README/main.py specifies" occurs only in Task 14, Steps 1-2, which is a runtime instruction pointing at each *other* project's own documentation for its own startup command (deliberately not duplicated here, since this plan doesn't own those projects' docs) — not a stand-in for code this plan itself is responsible for writing.

**3. Type/interface consistency:** `PlayerPropPrediction` (Task 3: `player_id`, `player_name`, `recent_team`, `position`, `anytime_td_prob`, optional yardage fields) is used identically in Task 1's backend test assertions (`recent_team`, `position` keys), Task 10's `filterPlayerPropsForGame` and its test fixtures, and Task 10's rendered player-prop rows (`prop.position`, `prop.recent_team`). `SportApi` (Task 3) is implemented by `createApiClient`'s return value (Task 4), consumed via `useSport().api` (Task 5) in `GamesPage` (Task 11) and `TrackRecordPage` (Task 12), and passed directly as a typed prop into `GameDetailModal` (Task 10) — the same five method names/signatures (`games`, `gamePrediction`, `playerProps`, `trackRecord`, `retrain`) appear unchanged across all five sites. `GameSummary.spread_line`/`total_line` (optional, Task 3) are read with `!= null` guards in both `GameCard` (Task 9) and `GameDetailModal`'s markets section (Task 10) rather than assumed present. `Sport` (Task 3) is used identically in `SportContext` (Task 5) and `SportToggle` (Task 13).
