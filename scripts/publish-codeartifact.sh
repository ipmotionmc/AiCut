#!/usr/bin/env bash
# One-shot publisher for @ipmotionmc/aicut-* to Iplex's private AWS CodeArtifact
# npm registry. Sibling to `publish.sh` (which targets npmjs.com).
#
# Usage:
#   ./scripts/publish-codeartifact.sh
#   ./scripts/publish-codeartifact.sh --dry-run
#   ./scripts/publish-codeartifact.sh --packages core,react
#
# Registry:
#   iplex-883218392300.d.codeartifact.us-west-2.amazonaws.com/npm/iplex-npm/
#   (domain=iplex owner=883218392300 region=us-west-2 repo=iplex-npm)
#
# Behaviour:
#   - Reads version from each packages/*/package.json.
#   - Idempotent: skips any @ipmotionmc/aicut-<pkg>@<version> that's already on
#     the registry. Re-run after a network flake and only the still-
#     unpublished packages get pushed.
#   - Mints a fresh CodeArtifact auth token via
#     `aws codeartifact get-authorization-token` — no OTP or long-lived
#     token to manage. Token is short-lived (12h by default) and lives
#     ONLY inside a temp .npmrc outside the repo, cleaned on EXIT.
#   - Publishes core → react → vue so any dependants that resolve via
#     workspace:* peers land after their producer.
#   - Does NOT tag; CodeArtifact publishes are internal, tag on main
#     via the npmjs `publish.sh` path.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

# ---- CodeArtifact endpoint (matches Iplex's committed root .npmrc) -------
CA_DOMAIN="iplex"
CA_OWNER="883218392300"
CA_REGION="us-west-2"
CA_REPO="iplex-npm"
REGISTRY="https://${CA_DOMAIN}-${CA_OWNER}.d.codeartifact.${CA_REGION}.amazonaws.com/npm/${CA_REPO}/"
# `.npmrc` needs the host WITHOUT scheme for the auth key.
REGISTRY_HOST="${REGISTRY#https://}"
REGISTRY_HOST="${REGISTRY_HOST%/}"

# ---- arg parsing ---------------------------------------------------------
DRY_RUN=""
PACKAGES=(core react vue)
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN="--dry-run" ;;
    --packages)
      IFS=',' read -r -a PACKAGES <<<"$2"; shift ;;
    --packages=*)
      IFS=',' read -r -a PACKAGES <<<"${1#*=}" ;;
    -h|--help)
      grep -E '^# ' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "unknown flag: $1" >&2; exit 2 ;;
  esac
  shift
done

# ---- mint token ---------------------------------------------------------
echo "→ minting CodeArtifact token (domain=${CA_DOMAIN} region=${CA_REGION})"
CA_TOKEN=$(aws codeartifact get-authorization-token \
  --domain "$CA_DOMAIN" \
  --domain-owner "$CA_OWNER" \
  --region "$CA_REGION" \
  --query authorizationToken --output text)
if [ -z "$CA_TOKEN" ]; then
  echo "!! failed to mint CodeArtifact token — check AWS creds" >&2
  exit 3
fi

# ---- temp .npmrc (never touches the repo) --------------------------------
NPMRC=$(mktemp -t aicut-codeartifact-npmrc.XXXXXX)
cleanup() { rm -f "$NPMRC"; }
trap cleanup EXIT
cat > "$NPMRC" <<EOF
# Ephemeral publish config — auto-generated, do NOT commit.
registry=${REGISTRY}
@ipmotionmc:registry=${REGISTRY}
//${REGISTRY_HOST}/:always-auth=true
//${REGISTRY_HOST}/:_authToken=${CA_TOKEN}
EOF

# ---- publish loop --------------------------------------------------------
for pkg in "${PACKAGES[@]}"; do
  pkg_dir="${ROOT}/packages/${pkg}"
  if [ ! -d "$pkg_dir" ]; then
    echo "!! ${pkg}: not found at ${pkg_dir}" >&2
    exit 4
  fi

  version=$(node -p "require('${pkg_dir}/package.json').version")
  name=$(node -p "require('${pkg_dir}/package.json').name")
  echo
  echo "▸ ${name}@${version}"

  # Idempotent check: does this version already exist? A 404 means "go
  # publish"; a 200 means "skip". `npm view` respects the temp .npmrc.
  if npm --userconfig "$NPMRC" view "${name}@${version}" version --json >/dev/null 2>&1; then
    echo "  ✓ already on CodeArtifact — skipping"
    continue
  fi

  # pnpm respects --userconfig for the auth npmrc but reads the
  # workspace-level .npmrc for other settings, which is fine.
  ( cd "$pkg_dir" && \
    pnpm publish \
      --no-git-checks \
      --registry "$REGISTRY" \
      --userconfig "$NPMRC" \
      ${DRY_RUN} )
  echo "  ✓ published ${name}@${version}"
done

echo
echo "✓ done. Consumers install with:"
echo "  @ipmotionmc:registry=${REGISTRY}"
echo "  //${REGISTRY_HOST}/:_authToken=\${NODE_AUTH_TOKEN}"
