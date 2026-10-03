#!/bin/bash
# Publish Cero releases, one per platform, each from its own branch.
#
#   scripts/release.sh macos     # build the Apple Silicon DMG here, publish v<version>-macos
#   scripts/release.sh linux     # CI builds the Arch package, .deb, .rpm and .AppImage
#   scripts/release.sh windows   # CI builds the .msi and setup .exe
#   scripts/release.sh all       # the three, in that order
#
# Each platform has a branch (release/macos, release/linux, release/windows). This script fast-
# forwards it to the current commit and pushes it; .github/workflows/release.yml then builds and
# publishes the GitHub release v<version>-<platform>. Fix one platform later by committing to its
# branch and pushing again: only that release is rebuilt.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="$(node -p "require('./package.json').version")"
PLATFORMS=("$@")
[ "${PLATFORMS[0]:-}" = "all" ] && PLATFORMS=(macos linux windows)
[ ${#PLATFORMS[@]} -eq 0 ] && { sed -n '2,12p' "$0"; exit 2; }

[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "Commit or stash your changes first." >&2; exit 1; }
[ "$(git config user.name)" = "NetPranav" ] || { echo "git user.name is not NetPranav." >&2; exit 1; }
HEAD_SHA="$(git rev-parse HEAD)"

echo "Cero $VERSION from $(git rev-parse --abbrev-ref HEAD) ($(git rev-parse --short HEAD))"
CI=true npm test >/dev/null && echo "tests: pass"

for platform in "${PLATFORMS[@]}"; do
  branch="release/$platform"
  tag="v$VERSION-$platform"
  echo "== $platform: $branch -> $tag"
  if git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
    git fetch -q origin "$branch"
    # Platform-only fixes live on the branch: merge them rather than overwrite
    if ! git merge-base --is-ancestor "origin/$branch" "$HEAD_SHA"; then
      echo "   $branch has commits that are not in this branch; merge them first." >&2
      exit 1
    fi
  fi
  git push origin "$HEAD_SHA:refs/heads/$branch"

  if [ "$platform" = "macos" ] && [ "$(uname -s)" = "Darwin" ]; then
    # The Apple Silicon DMG is the build tested on this Mac; CI adds the Intel one
    CI=true npm run bundle:dmg >/dev/null
    out="$(mktemp -d)"
    cp "src-tauri/target/release/bundle/dmg/Cero_${VERSION}_aarch64.dmg" "$out/Cero.Terminal_${VERSION}_aarch64.dmg"
    (cd "$out" && shasum -a 256 "Cero.Terminal_${VERSION}_aarch64.dmg" > SHA256SUMS-apple-silicon.txt)
    if gh release view "$tag" >/dev/null 2>&1; then
      gh release upload "$tag" "$out"/* --clobber
    else
      gh release create "$tag" "$out"/* --target "$branch" --title "Cero $VERSION for macOS" --notes-file docs/releases/macos.md
    fi
  fi
done
echo "Pushed. Builds: gh run list --workflow release.yml"
