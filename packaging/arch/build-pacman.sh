#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BUNDLE_DIR="${REPO_ROOT}/src-tauri/target/release/bundle/pacman"
BUILD_DIR="${SCRIPT_DIR}/build"
RELEASE_BIN="${REPO_ROOT}/src-tauri/target/release/sentinel-terminal"

echo "=== Building Arch Linux Pacman Package for Sentinel Terminal ==="

# Step 1: Ensure frontend production assets are built
echo "[1/4] Building web application production assets..."
cd "${REPO_ROOT}"
npm run build

# Step 2: Build release binary with explicit custom-protocol feature
echo "[2/4] Compiling Rust release binary with embedded assets (custom-protocol)..."
cargo build --release --manifest-path "${REPO_ROOT}/src-tauri/Cargo.toml" --features tauri/custom-protocol

# Step 3: Hardened verification of embedded assets
echo "[3/4] Verifying binary asset embedding and protocol configuration..."
if [ ! -f "${RELEASE_BIN}" ]; then
    echo "ERROR: Release binary not found at ${RELEASE_BIN}" >&2
    exit 1
fi

if ! strings "${RELEASE_BIN}" | grep "tauri://localhost" >/dev/null; then
    echo "ERROR: Release binary was compiled without embedded assets or custom-protocol!" >&2
    echo "The binary lacks 'tauri://localhost' and will fail with 'connection refused' at runtime." >&2
    exit 1
fi
echo "Asset embedding verified: 'tauri://localhost' is active."

# Step 4: Package via makepkg
echo "[4/4] Assembling Arch Linux package via makepkg..."
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"
mkdir -p "${BUNDLE_DIR}"

# Stage sources
cp "${RELEASE_BIN}" "${BUILD_DIR}/"
cp "${SCRIPT_DIR}/sentinel" "${BUILD_DIR}/"
cp "${SCRIPT_DIR}/sentinel-shell" "${BUILD_DIR}/"
cp "${SCRIPT_DIR}/sentinel_open.desktop" "${BUILD_DIR}/"
cp "${SCRIPT_DIR}/sentinel-terminal.desktop" "${BUILD_DIR}/"
cp "${REPO_ROOT}/src-tauri/icons/icon.png" "${BUILD_DIR}/icon.png"
cp "${REPO_ROOT}/src-tauri/icons/128x128.png" "${BUILD_DIR}/128x128.png"
cp "${REPO_ROOT}/src-tauri/icons/32x32.png" "${BUILD_DIR}/32x32.png"
cp "${REPO_ROOT}/packaging/linux/sentinel-terminal-mime.xml" "${BUILD_DIR}/"
cp "${SCRIPT_DIR}/PKGBUILD" "${BUILD_DIR}/"

# Build package using makepkg
cd "${BUILD_DIR}"
makepkg -f --nodeps

# Copy result to bundle directory
PKG_FILES=$(find "${BUILD_DIR}" -name "*.pkg.tar.zst" -type f)
if [ -n "${PKG_FILES}" ]; then
    cp ${PKG_FILES} "${BUNDLE_DIR}/"
    for f in ${PKG_FILES}; do
        pkg_dest="${BUNDLE_DIR}/$(basename "${f}")"
        echo "Pacman package created: ${pkg_dest}"
        echo "Package size: $(du -h "${pkg_dest}" | cut -f1)"
        echo "Installation command:"
        echo "  sudo pacman -U ${pkg_dest}"
    done
else
    echo "ERROR: Failed to find generated .pkg.tar.zst" >&2
    exit 1
fi

# Clean up build directory
rm -rf "${BUILD_DIR}"
echo "=== Arch Pacman Package Build Complete ==="
