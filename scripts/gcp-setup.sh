#!/usr/bin/env bash
# One-time Google Cloud setup for the trip assistant's runner (runner/, on Cloud Run). Run it signed in to gcloud
# (`gcloud auth login`), with the project's ID:  scripts/gcp-setup.sh <project-id>
# Safe to run again: what exists already is kept. It sets up
#   - the APIs it needs; a Docker repository for the runner's image
#   - the runner's own service account, allowed to queue runs on Cloud Tasks; the queue (no retries: a run that
#     dies is reported, not run twice)
#   - a deployer service account that GitHub Actions uses through Workload Identity Federation (no key to keep),
#     only from this repository
# and prints the repository variables for the Deploy workflow.
set -euo pipefail

PROJECT=${1:?Usage: scripts/gcp-setup.sh <project-id>}
REGION=${REGION:-asia-east1}
GITHUB_REPO=${GITHUB_REPO:-yun-cheng/rtw-map}
RUNNER_SA=rtw-runner@$PROJECT.iam.gserviceaccount.com
DEPLOYER_SA=rtw-deployer@$PROJECT.iam.gserviceaccount.com
NUMBER=$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')

gcloud config set project "$PROJECT"
gcloud services enable run.googleapis.com cloudtasks.googleapis.com artifactregistry.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com

gcloud artifacts repositories describe rtw --location="$REGION" >/dev/null 2>&1 ||
  gcloud artifacts repositories create rtw --location="$REGION" --repository-format=docker --description="rtw-map runner images"

# The runner: queues runs for itself.
gcloud iam service-accounts describe "$RUNNER_SA" >/dev/null 2>&1 ||
  gcloud iam service-accounts create rtw-runner --display-name="rtw-map runner"
gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$RUNNER_SA" --role=roles/cloudtasks.enqueuer --condition=None >/dev/null
gcloud tasks queues describe rtw-runs --location="$REGION" >/dev/null 2>&1 ||
  gcloud tasks queues create rtw-runs --location="$REGION" --max-attempts=1 --max-concurrent-dispatches=20

# GitHub Actions: pushes the image and deploys the service, as the runner's account.
gcloud iam service-accounts describe "$DEPLOYER_SA" >/dev/null 2>&1 ||
  gcloud iam service-accounts create rtw-deployer --display-name="rtw-map deployer (GitHub Actions)"
for role in roles/run.admin roles/artifactregistry.writer; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$DEPLOYER_SA" --role=$role --condition=None >/dev/null
done
gcloud iam service-accounts add-iam-policy-binding "$RUNNER_SA" --member="serviceAccount:$DEPLOYER_SA" --role=roles/iam.serviceAccountUser >/dev/null

gcloud iam workload-identity-pools describe github --location=global >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create github --location=global --display-name="GitHub Actions"
gcloud iam workload-identity-pools providers describe github --location=global --workload-identity-pool=github >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc github --location=global --workload-identity-pool=github \
    --issuer-uri=https://token.actions.githubusercontent.com \
    --attribute-mapping=google.subject=assertion.sub,attribute.repository=assertion.repository \
    --attribute-condition="assertion.repository=='$GITHUB_REPO'"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOYER_SA" --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$GITHUB_REPO" >/dev/null

cat <<EOF

Done. Repository variables for the Deploy workflow (GitHub → Settings → Secrets and variables → Actions → Variables):
  GCP_PROJECT=$PROJECT
  GCP_REGION=$REGION
  GCP_WIF_PROVIDER=projects/$NUMBER/locations/global/workloadIdentityPools/github/providers/github
And the repository secret RUNNER_SECRET (the same value as the Worker's: wrangler secret put RUNNER_SECRET).
EOF
