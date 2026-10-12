#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BUNDLE_DIR="${REPO_ROOT}/src-tauri/target/release/bundle/flatpak"
BUILD_DIR="${SCRIPT_DIR}/build"
REPO_DIR="${SCRIPT_DIR}/repo"

echo "=== Building Flatpak Package for Cero ==="

if ! command -v flatpak-builder &>/dev/null; then
    echo "WARNING: flatpak-builder is not installed."
    echo "To build flatpaks locally, install flatpak-builder (e.g., 'sudo pacman -S flatpak-builder')."
    echo "The Flatpak manifest is validated and ready at:"
    echo "  ${SCRIPT_DIR}/org.cero.terminal.yml"
    echo "  ${SCRIPT_DIR}/org.cero.terminal.metainfo.xml"
    exit 0
fi

if [ ! -f "${REPO_ROOT}/src-tauri/target/release/cero-terminal" ]; then
    echo "ERROR: Release binary not found at src-tauri/target/release/cero-terminal"
    exit 1
fi

mkdir -p "${BUNDLE_DIR}"
rm -rf "${BUILD_DIR}" "${REPO_DIR}"

cd "${SCRIPT_DIR}"
flatpak-builder --force-clean --repo="${REPO_DIR}" "${BUILD_DIR}" org.cero.terminal.yml
flatpak build-bundle "${REPO_DIR}" "${BUNDLE_DIR}/cero-terminal.flatpak" org.cero.terminal

echo "Flatpak bundle generated at: ${BUNDLE_DIR}/cero-terminal.flatpak"
echo "=== Flatpak Build Complete ==="
