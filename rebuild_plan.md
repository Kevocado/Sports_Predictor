# Rebuild & Deploy Plan — Sports Predictor

> **SUPERSEDED — the deployment this plan describes is no longer live.**
> Read this for the Caddyfile reasoning and the timeout change, which still stand.
> Do **not** follow the Azure steps: `*.azurecontainerapps.io` hostnames are dead, and
> nothing here can be scaled to zero.
>
> Sports Predictor is deployed by `.github/workflows/deploy.yml`'s `vps` job
> (`if: vars.VPS_HOST != ''`), which runs `ssh deploy@$VPS_HOST deploy sports <sha>`
> against the shared stack at `/opt/stack`. The `deploy-azure` job in the same file is
> labelled **legacy** and is gated on `vars.DEPLOY_AZURE == 'true'`, which is unset.
> Every service there is a Docker Compose service under an anchor carrying
> `restart: unless-stopped`, so it is continuously supervised and **has no
> scale-to-zero** — the check in `rebuild_plan_continued.md` Step 4 for containers
> "stopped / scaled-to-zero" cannot fail and will mislead you.
>
> This file previously described the Azure Container Apps path as the live one and
> told the reader to check backends for scale-down. Both were true when written and
> are now wrong, which is the same defect this repo's ledger keeps recording: a
> plausible mechanism written down as a finding and never traced to the line that
> does the work. The correction is a note rather than a deletion so the shape of it
> stays visible.

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
