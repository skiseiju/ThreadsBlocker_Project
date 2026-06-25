#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT_DIR/dist"
FIREFOX_DIR="$DIST_DIR/firefox"
DEFAULT_METADATA="$ROOT_DIR/amo-metadata.json"

CHANNEL="listed"
METADATA_FILE="$DEFAULT_METADATA"
APPROVAL_TIMEOUT="${AMO_APPROVAL_TIMEOUT:-0}"
UPLOAD_SOURCE_CODE=true
BUILD_FIRST=true
WEB_EXT_BIN="${WEB_EXT_BIN:-}"
DRY_RUN=false

usage() {
    cat <<'EOF'
Usage: scripts/publish-firefox-amo.sh [options]

Options:
  --listed                 Submit a public AMO listed version (default).
  --unlisted               Submit for Mozilla signing only; downloads signed XPI.
  --metadata PATH          AMO metadata JSON. Used for listed submissions.
  --approval-timeout MS    Wait for AMO approval before exiting. Default: 0.
  --no-source-upload       Do not upload the generated source archive.
  --skip-build             Reuse the existing dist/firefox directory.
  --dry-run                Build and validate local inputs without submitting.
  -h, --help               Show this help.

Required credentials:
  AMO_JWT_ISSUER or WEB_EXT_API_KEY
  AMO_JWT_SECRET or WEB_EXT_API_SECRET

Examples:
  AMO_JWT_ISSUER=... AMO_JWT_SECRET=... npm run firefox:publish
  AMO_JWT_ISSUER=... AMO_JWT_SECRET=... npm run firefox:sign
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --listed)
            CHANNEL="listed"
            shift
            ;;
        --unlisted)
            CHANNEL="unlisted"
            shift
            ;;
        --metadata)
            METADATA_FILE="${2:-}"
            if [[ -z "$METADATA_FILE" ]]; then
                echo "Error: --metadata requires a path." >&2
                exit 1
            fi
            shift 2
            ;;
        --approval-timeout)
            APPROVAL_TIMEOUT="${2:-}"
            if [[ -z "$APPROVAL_TIMEOUT" ]]; then
                echo "Error: --approval-timeout requires milliseconds." >&2
                exit 1
            fi
            shift 2
            ;;
        --no-source-upload)
            UPLOAD_SOURCE_CODE=false
            shift
            ;;
        --skip-build)
            BUILD_FIRST=false
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo "Error: unknown option '$1'." >&2
            usage >&2
            exit 1
            ;;
    esac
done

API_KEY="${AMO_JWT_ISSUER:-${WEB_EXT_API_KEY:-}}"
API_SECRET="${AMO_JWT_SECRET:-${WEB_EXT_API_SECRET:-}}"

if [[ "$DRY_RUN" != "true" && ( -z "$API_KEY" || -z "$API_SECRET" ) ]]; then
    echo "Error: set AMO_JWT_ISSUER and AMO_JWT_SECRET before publishing." >&2
    exit 1
fi

if [[ "$BUILD_FIRST" == "true" ]]; then
    "$ROOT_DIR/build.sh" --no-bump
fi

if [[ ! -f "$FIREFOX_DIR/manifest.json" || ! -f "$FIREFOX_DIR/content.js" ]]; then
    echo "Error: dist/firefox is missing manifest.json or content.js. Run ./build.sh --no-bump first." >&2
    exit 1
fi

MANIFEST_VERSION="$(node -e "console.log(require(process.argv[1]).version)" "$FIREFOX_DIR/manifest.json")"
PRODUCT_VERSION="$(sed -n "s/^[[:space:]]*VERSION: '\([^']*\)'.*/\1/p" "$ROOT_DIR/src/config.js" | head -n 1 | tr -d '\r')"
SOURCE_ZIP="$DIST_DIR/firefox-source-v${MANIFEST_VERSION}.zip"
ARTIFACTS_DIR="$DIST_DIR/firefox-amo-artifacts"

mkdir -p "$ARTIFACTS_DIR"

if [[ "$UPLOAD_SOURCE_CODE" == "true" ]]; then
    SOURCE_TMP="$(mktemp -d "${TMPDIR:-/tmp}/threadsblocker-amo-source.XXXXXX")"
    SOURCE_ROOT="$SOURCE_TMP/threadsblocker-source-v${MANIFEST_VERSION}"
    mkdir -p "$SOURCE_ROOT"
    trap 'rm -rf "$SOURCE_TMP"' EXIT

    cp "$ROOT_DIR/README.md" "$SOURCE_ROOT/README.md"
    cp "$ROOT_DIR/CHANGELOG.md" "$SOURCE_ROOT/CHANGELOG.md"
    cp "$ROOT_DIR/build.sh" "$SOURCE_ROOT/build.sh"
    cp "$ROOT_DIR/package.json" "$SOURCE_ROOT/package.json"
    if [[ -f "$ROOT_DIR/package-lock.json" ]]; then
        cp "$ROOT_DIR/package-lock.json" "$SOURCE_ROOT/package-lock.json"
    fi
    mkdir -p "$SOURCE_ROOT/src"
    (cd "$ROOT_DIR" && tar -cf - src) | (cd "$SOURCE_ROOT" && tar -xf -)

    cat > "$SOURCE_ROOT/AMO_SOURCE_README.txt" <<EOF
ThreadsBlocker Firefox AMO Source Package
=========================================

Submitted extension version
---------------------------
Firefox AMO manifest version: ${MANIFEST_VERSION}
Product/release version shown by the extension: ${PRODUCT_VERSION}
Repository: https://github.com/skiseiju/ThreadsBlocker_Project

Why source code is provided
---------------------------
This add-on uses the repository-local build.sh script to concatenate source
files under src/ into one readable content.js file for browser extension
compatibility, copy the Firefox manifest and icon, and package dist/firefox as
an XPI zip file.

It does not use webpack, minifiers, transpilers, obfuscators, remote code
generation, or remotely hosted executable code.

Build environment
-----------------
Required tools:
- bash 3.2+ or compatible shell
- sed
- cat
- cp
- mkdir
- rm
- tar
- zip 3.0+ compatible

Reproducible build steps
------------------------
From the root of this source package, run:

    FF_AMO_VERSION=${MANIFEST_VERSION} ./build.sh --no-bump

Expected Firefox output files:

    dist/firefox/content.js
    dist/firefox/manifest.json
    dist/firefox/icon.png
    dist/threads_blocker_firefox.xpi

Notes for reviewers
-------------------
The source files are human-authored JavaScript, JSON, and static assets. The
generated content.js in the XPI is not minified or obfuscated; it is a
concatenation of the source files with module syntax removed.

The add-on only runs on threads.net / threads.com and does not request cookies,
history, tabs, or broad cross-site browsing permissions.
EOF

    rm -f "$SOURCE_ZIP"
    (cd "$SOURCE_TMP" && zip -qr "$SOURCE_ZIP" "threadsblocker-source-v${MANIFEST_VERSION}")
    echo "AMO source archive: $SOURCE_ZIP"
fi

WEB_EXT_CMD=()
if [[ -n "$WEB_EXT_BIN" ]]; then
    WEB_EXT_CMD=("$WEB_EXT_BIN")
elif [[ -x "$ROOT_DIR/node_modules/.bin/web-ext" ]]; then
    WEB_EXT_CMD=("$ROOT_DIR/node_modules/.bin/web-ext")
else
    WEB_EXT_CMD=(npx --yes web-ext@10.4.0)
fi

WEB_EXT_ARGS=(
    sign
    --source-dir "$FIREFOX_DIR"
    --artifacts-dir "$ARTIFACTS_DIR"
    --channel "$CHANNEL"
    --approval-timeout "$APPROVAL_TIMEOUT"
)

if [[ "$DRY_RUN" != "true" ]]; then
    WEB_EXT_ARGS+=(--api-key "$API_KEY" --api-secret "$API_SECRET")
fi

if [[ "$CHANNEL" == "listed" ]]; then
    if [[ ! -f "$METADATA_FILE" ]]; then
        echo "Error: metadata file not found: $METADATA_FILE" >&2
        exit 1
    fi
    WEB_EXT_ARGS+=(--amo-metadata "$METADATA_FILE")
fi

if [[ "$UPLOAD_SOURCE_CODE" == "true" ]]; then
    WEB_EXT_ARGS+=(--upload-source-code "$SOURCE_ZIP")
fi

if [[ "$DRY_RUN" == "true" ]]; then
    echo "Firefox AMO dry run passed."
    echo "Channel: $CHANNEL"
    echo "Manifest version: $MANIFEST_VERSION"
    echo "Source dir: $FIREFOX_DIR"
    echo "Artifacts dir: $ARTIFACTS_DIR"
    if [[ "$CHANNEL" == "listed" ]]; then
        echo "Metadata: $METADATA_FILE"
    fi
    if [[ "$UPLOAD_SOURCE_CODE" == "true" ]]; then
        echo "Source archive: $SOURCE_ZIP"
    fi
    exit 0
fi

echo "Submitting Firefox add-on to AMO channel '$CHANNEL'..."
"${WEB_EXT_CMD[@]}" "${WEB_EXT_ARGS[@]}"

echo "Firefox AMO submission finished for manifest version $MANIFEST_VERSION."
