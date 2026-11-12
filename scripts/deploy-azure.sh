#!/usr/bin/env bash
# Deploys the public demo to Azure Container Apps.
#
#   bash scripts/deploy-azure.sh
#
# Re-runnable. The first run creates the resource group, a container registry and a Container
# Apps environment; every run builds a fresh image in the cloud (no local Docker needed) and
# rolls the app onto it. One replica, always on: SQLite has one writer, and a cold start
# would greet the first visitor with a spinner.
#
# Needs: `az login` done, db/seed.db built (npm run demo:seed), GEMINI_API_KEY in .env.
# The key is passed as a Container Apps secret; it is never baked into the image.
set -euo pipefail
export MSYS_NO_PATHCONV=1   # Git Bash on Windows: do not rewrite /subscriptions/... arguments
# The Windows az CLI crashes streaming build logs that contain non-ASCII (Next prints "▲").
export PYTHONIOENCODING=utf-8 PYTHONUTF8=1

RG=${KIVI_RG:-kivi-demo-rg}
LOC=${KIVI_LOCATION:-centralindia}
APP=${KIVI_APP:-kivi}
ENVN=${KIVI_ENV:-kivi-env}
CHAT_MODEL=${KIVI_CHAT_MODEL_DEPLOY:-gemini-3.5-flash-lite}
# KIVI_TAG=<existing tag> skips the build and deploys an image already in the registry.
TAG=${KIVI_TAG:-$(date +%Y%m%d%H%M%S)}

cd "$(dirname "$0")/.."
[ -f db/seed.db ] || { echo "db/seed.db is missing: run npm run demo:seed first"; exit 1; }
KEY=$(grep -E '^GEMINI_API_KEY=' .env | head -1 | cut -d= -f2- | tr -d "\"'\r ")
[ -n "$KEY" ] || { echo "GEMINI_API_KEY is empty in .env"; exit 1; }

echo "== subscription: $(az account show --query name -o tsv)"
az extension add --name containerapp --upgrade --only-show-errors -y >/dev/null
for ns in Microsoft.App Microsoft.OperationalInsights Microsoft.ContainerRegistry; do
  az provider register -n "$ns" --wait --only-show-errors >/dev/null
done

az group create -n "$RG" -l "$LOC" -o none

# Registry names are global; remember the one this checkout created.
if [ -f .azure-acr ]; then ACR=$(cat .azure-acr); else ACR="kivi$(date +%s | tail -c 7)$RANDOM"; echo "$ACR" > .azure-acr; fi
if ! az acr show -n "$ACR" -g "$RG" -o none 2>/dev/null; then
  echo "== creating registry $ACR"
  az acr create -n "$ACR" -g "$RG" -l "$LOC" --sku Basic --admin-enabled true -o none
fi

if [ -z "${KIVI_TAG:-}" ]; then
  echo "== building image $ACR.azurecr.io/kivi:$TAG in the cloud"
  # Logs are not streamed: the Windows az CLI crashes printing Next's non-ASCII output
  # whatever the console encoding. Queue, poll, and show sanitised logs only on failure.
  RUN=$(az acr build -r "$ACR" -t "kivi:$TAG" --no-logs --only-show-errors --query runId -o tsv .)
  echo "   run $RUN queued"
  while :; do
    STATUS=$(az acr task show-run -r "$ACR" --run-id "$RUN" --query status -o tsv)
    case "$STATUS" in
      Succeeded) echo "   build succeeded"; break ;;
      Failed|Canceled|Error|Timeout)
        echo "   build $STATUS"
        az acr task logs -r "$ACR" --run-id "$RUN" 2>&1 | tr -cd '\11\12\15\40-\176' | tail -60
        exit 1 ;;
    esac
    sleep 15
  done
else
  echo "== using existing image $ACR.azurecr.io/kivi:$TAG"
fi

if ! az containerapp env show -n "$ENVN" -g "$RG" -o none 2>/dev/null; then
  echo "== creating Container Apps environment $ENVN"
  az containerapp env create -n "$ENVN" -g "$RG" -l "$LOC" -o none
fi

ACR_USER=$(az acr credential show -n "$ACR" --query username -o tsv)
ACR_PASS=$(az acr credential show -n "$ACR" --query "passwords[0].value" -o tsv)
IMAGE="$ACR.azurecr.io/kivi:$TAG"
ENV_VARS=(
  GEMINI_API_KEY=secretref:gemini-key
  KIVI_CHAT_PROVIDER=gemini
  KIVI_EXTRACT_PROVIDER=gemini
  "KIVI_CHAT_MODEL=$CHAT_MODEL"
  KIVI_EMBED_PROVIDER=auto
  KIVI_RATE_PER_10MIN=20
  KIVI_DAILY_CAP=1500
)

if ! az containerapp show -n "$APP" -g "$RG" -o none 2>/dev/null; then
  echo "== creating app $APP"
  az containerapp create -n "$APP" -g "$RG" --environment "$ENVN" \
    --image "$IMAGE" --registry-server "$ACR.azurecr.io" \
    --registry-username "$ACR_USER" --registry-password "$ACR_PASS" \
    --target-port 3000 --ingress external \
    --cpu 0.5 --memory 1.0Gi --min-replicas 1 --max-replicas 1 \
    --secrets "gemini-key=$KEY" \
    --env-vars "${ENV_VARS[@]}" -o none
else
  echo "== updating app $APP"
  az containerapp secret set -n "$APP" -g "$RG" --secrets "gemini-key=$KEY" -o none
  az containerapp update -n "$APP" -g "$RG" --image "$IMAGE" \
    --set-env-vars "${ENV_VARS[@]}" -o none
fi

FQDN=$(az containerapp show -n "$APP" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv)
echo
echo "== live: https://$FQDN"
