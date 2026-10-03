#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BUNDLE_ROOT="${REPO_ROOT}/src-tauri/target/release/bundle"

echo "=========================================================="
echo " Cero v2.0.0 - Multi-Distribution Packaging"
echo "=========================================================="

cd "${REPO_ROOT}"

# 1. Build Native Tauri Packages: Deb, AppImage, RPM
echo "[1/4] Bundling Debian (.deb), AppImage (.AppImage), and Red Hat (.rpm)..."
npx tauri build --bundles deb,appimage,rpm

# 2. Build Arch Linux Pacman Package (.pkg.tar.zst)
echo "[2/4] Packaging Arch Linux Pacman (.pkg.tar.zst)..."
"${REPO_ROOT}/packaging/arch/build-pacman.sh"

# 3. Build Flatpak (if flatpak-builder is available)
echo "[3/4] Staging Flatpak infrastructure..."
"${REPO_ROOT}/packaging/flatpak/build-flatpak.sh"

# 4. Build Snap (if snapcraft is available)
echo "[4/4] Staging Snapcraft infrastructure..."
"${REPO_ROOT}/packaging/snap/build-snap.sh"

echo ""
echo "=========================================================="
echo " Distribution Packages Generated"
echo "=========================================================="
printf "%-12s | %-10s | %s\n" "FORMAT" "SIZE" "PATH"
echo "-------------+------------+-------------------------------------------------"

find "${BUNDLE_ROOT}" -type f \( -name "*.deb" -o -name "*.AppImage" -o -name "*.rpm" -o -name "*.pkg.tar.zst" -o -name "*.flatpak" -o -name "*.snap" \) | while read -r pkg; do
    FMT=$(basename "${pkg}" | sed -E 's/.*\.([^.]+)$/\1/')
    SIZE=$(ls -lh "${pkg}" | awk '{print $5}')
    printf "%-12s | %-10s | %s\n" "${FMT}" "${SIZE}" "${pkg}"
done

echo "=========================================================="
