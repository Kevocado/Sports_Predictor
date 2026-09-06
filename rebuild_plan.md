# Rebuild & Deploy Plan — Sports Predictor

## Problem
- Local Caddyfile edited but deployed Azure container uses old `.internal.` config (or stale image)
- Backends unreachable → frontend hangs (300s timeout masks failure)
- Predictions never appear in deployed frontend

## Step 1: Confirm Caddyfile (done)
- `nfl-predictor.proudbay-f56b8dfa.eastus2.azurecontainerapps.io:8001`
- `cfb-predictor.proudbay-f56b8dfa.eastus2.azurecontainerapps.io:8003`
- Timeout: consider reducing to `30s` (per comment) so failures surface fast

## Step 2: Build frontend
`npm run build` (produces `dist/` copied by Dockerfile)

## Step 3: Rebuild Docker image
`docker build -t sports-predictor:latest .`

## Step 4: Push / Deploy
Push image, update Azure Container App revision with new image.

## Step 5: Verify backends running
Check `nfl-predictor` and `cfb-predictor` Container Apps are running (not scaled-to-zero or stopped).

## Step 6: Verify in browser
- `/nfl/` → predictions load
- `/cfb/` → predictions load
- `handle_path /nfl/*` strips prefix → `/api/games` hits backend correctly

## Step 7: If still slow → check Caddy logs inside container
`caddy reload --config /etc/caddy/Caddyfile` or restart container.
