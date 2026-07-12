#!/usr/bin/env bash
# Vercel Ignored Build Step.
# Exit 0 = skip this deployment; exit 1 = proceed with build.
# See: https://vercel.com/docs/project-configuration/git-settings#ignored-build-step
set -euo pipefail

# Always ship production (main) deploys.
if [[ "${VERCEL_ENV:-}" == "production" ]]; then
  echo "Production deploy — building."
  exit 1
fi

# First commit / shallow clone without parent: build.
if ! git rev-parse --verify HEAD^ >/dev/null 2>&1; then
  echo "No parent commit — building."
  exit 1
fi

mapfile -t CHANGED < <(git diff --name-only HEAD^ HEAD)
if [[ ${#CHANGED[@]} -eq 0 ]]; then
  echo "No file changes — skipping build."
  exit 0
fi

# Preview deploys skip when every change is docs/meta-only.
# Anything else (app, lib, prisma, package files, tests that affect CI deploy
# surfaces, public assets) still builds.
is_skippable() {
  local f="$1"
  case "$f" in
    *.md|docs/*|AGENTS.md|CLAUDE.md|.github/*|.claude/*|.cursor/*|LICENSE*|CHANGELOG*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

for f in "${CHANGED[@]}"; do
  if ! is_skippable "$f"; then
    echo "Relevant change: $f — building."
    exit 1
  fi
done

echo "Only docs/meta changes — skipping preview build."
exit 0
