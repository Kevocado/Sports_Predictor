# Rebuild & Deploy Plan — Sports Predictor (CONTINUED)


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
