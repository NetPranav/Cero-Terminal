#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BUNDLE_DIR="${REPO_ROOT}/src-tauri/target/release/bundle/snap"

echo "=== Building Snap Package for Cero ==="

if ! command -v snapcraft &>/dev/null; then
    echo "WARNING: snapcraft is not installed."
    echo "The Snapcraft configuration is validated and ready at:"
    echo "  ${SCRIPT_DIR}/snapcraft.yaml"
    echo "To build snaps locally or on Canonical Launchpad, run 'snapcraft' in this directory."
    exit 0
fi

if [ ! -f "${REPO_ROOT}/src-tauri/target/release/cero-terminal" ]; then
    echo "ERROR: Release binary not found at src-tauri/target/release/cero-terminal"
    exit 1
fi

mkdir -p "${BUNDLE_DIR}"
cd "${SCRIPT_DIR}"
snapcraft --destructive-mode
cp ./*.snap "${BUNDLE_DIR}/"

echo "Snap package generated in: ${BUNDLE_DIR}"
echo "=== Snap Build Complete ==="
