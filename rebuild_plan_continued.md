# Rebuild & Deploy Plan — Sports Predictor (CONTINUED)

> **SUPERSEDED — Steps 4 onward describe a deployment that is no longer live.**
> See the banner in `rebuild_plan.md` for the full correction. In short: deploy is
> `deploy.yml`'s `vps` job (`ssh deploy@$VPS_HOST deploy sports <sha>`), the
> `deploy-azure` job is legacy and gated on an unset `DEPLOY_AZURE`, and every
> service is a Compose service with `restart: unless-stopped`.
>
> The Azure hostnames (`nfl-predictor.<env>.azurecontainerapps.io:8001`,
> `cfb-predictor.<env>.azurecontainerapps.io:8003`) are dead. The service *ports*
> below are still right — 8001 and 8003 are the backend container ports, reached
> internally over the compose network rather than by public FQDN. So the
> routing intent in Step 6 is reusable; the deploy commands in Step 4 are not.
>
> **The scale-to-zero check in Step 4 cannot fail** and should be deleted rather
> than run: nothing in this stack scales to zero.


## Completed (local)
- Step 1: Caddyfile fixed (public FQDNs + 30s timeout)
- Step 2: Frontend built (`vite build` — bypassed vitest conflict)
- Step 3: Docker image rebuilt (`sports-predictor:latest` verified inside)

## Step 4: Push / Deploy TO AZURE (run these)
# If using ACR / Docker Hub:
docker tag sports-predictor:latest <your-registry>/sports-predictor:latest
docker push <your-registry>/sports-predictor:latest

# Update Azure Container App (replace with your resource group/app names):
az containerapp update \
  --name sports-predictor-frontend \
  --resource-group <your-rg> \
  --image <your-registry>/sports-predictor:latest

# Or create new revision / restart:
az containerapp revision restart \
  --name sports-predictor-frontend \
  --resource-group <your-rg>

## Step 5: Verify backends running (do this before/after deploy)
# Check both backend Container Apps are not stopped / scaled-to-zero:
az containerapp show --name nfl-predictor --resource-group <rg>
az containerapp show --name cfb-predictor --resource-group <rg>

# If min-replicas is 0, they cold-start (~30s with new timeout, vs old 300s hang).
# If they show "Stopped" or 0 replicas with no traffic, scale them up or trigger a request.

## Step 6: Verify in browser — when to expect it
# Timeline after deploy:
- Image pull / container startup: 30–90 seconds
- Backend cold start (if scaled to 0): ~30 seconds (matches your comment / new timeout)
- First request to /nfl/ → predictions should load within ~1 minute of deploy
- Total: expect to see predictions in ~2 minutes after `az containerapp update`

# Check immediately after deploy:
- /nfl/ → GamesPage loads predictions from nfl-predictor:8001
- /cfb/ → GamesPage loads predictions from cfb-predictor:8003
- If you see loading/spinner instead of predictions: backends are still waking; wait 30s then retry.

## Step 7: If still slow after deploy
# Check inside deployed container (via console/logs):
docker logs <deployed-container-id> 2>/dev/null || az containerapp logs show --name sports-predictor-frontend --resource-group <rg>
# Look for: "i/o timeout" = backend unreachable; "connection refused" = backend down; no errors = working.
