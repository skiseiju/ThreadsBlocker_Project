#!/bin/bash

# ============================================================
# push.sh — 統一推送腳本
#
# 用法：
#   bash push.sh            Beta 推送（自動 bump beta 版號）
#   bash push.sh --release  正式版推送（去掉 beta tag、打 git tag、產出 extension.zip）
# ============================================================

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
MODE="beta"

if [[ "$1" == "--release" ]]; then
    MODE="release"
fi

# ── Step 1: Build ──────────────────────────────────────────
if [[ "$MODE" == "release" ]]; then
    echo "🚀 正式版發佈流程"
    echo "🔨 Building (--release: 去掉 beta tag)..."
    bash "$SCRIPT_DIR/build.sh" --release
else
    echo "🧪 Beta 推送流程"
    echo "🔨 Building (自動 bump beta 版號)..."
    bash "$SCRIPT_DIR/build.sh"
fi

# Re-read version after build (build.sh may have changed it)
VERSION=$(grep -oE "VERSION: '[^']+'" "$SCRIPT_DIR/src/config.js" | cut -d "'" -f 2 | tr -d '\r')
TAG_NAME="v$VERSION"
echo "📦 版本號: $TAG_NAME"

# ── Step 2: Commit ─────────────────────────────────────────
if [[ -n $(git -C "$SCRIPT_DIR" status -s) ]]; then
    if [[ "$MODE" == "release" ]]; then
        git -C "$SCRIPT_DIR" add .
        git -C "$SCRIPT_DIR" commit -m "release: v$VERSION"
    else
        git -C "$SCRIPT_DIR" add .
        git -C "$SCRIPT_DIR" commit -m "chore: build $TAG_NAME"
    fi
else
    echo "ℹ️ Working directory clean, nothing to commit."
fi

# ── Step 3: Push ───────────────────────────────────────────
echo "🚀 Pushing main branch..."
git -C "$SCRIPT_DIR" push origin main

# ── Step 4 (Release only): Tag + Extension ZIP ─────────────
if [[ "$MODE" == "release" ]]; then
    # Create & push git tag
    if git -C "$SCRIPT_DIR" rev-parse "$TAG_NAME" >/dev/null 2>&1; then
        echo "ℹ️ Tag $TAG_NAME already exists."
    else
        echo "🏷️ Creating tag: $TAG_NAME"
        git -C "$SCRIPT_DIR" tag "$TAG_NAME"
    fi
    git -C "$SCRIPT_DIR" push origin "$TAG_NAME"

    # Build extension.zip for Chrome Web Store
    EXT_DIR="$SCRIPT_DIR/dist/extension"
    ZIP_FILE="$SCRIPT_DIR/dist/extension.zip"
    if [ -d "$EXT_DIR" ]; then
        rm -f "$ZIP_FILE"
        (cd "$EXT_DIR" && zip -r "$ZIP_FILE" .)
        echo "📦 Chrome Extension ZIP: $ZIP_FILE"
    fi

    echo ""
    echo "✅ 正式版 $TAG_NAME 發佈完成！"
    echo "   → GitHub Release: 檢查 Actions tab"
    echo "   → Chrome Web Store: 手動上傳 dist/extension.zip"
else
    echo ""
    echo "✅ Beta $TAG_NAME 推送完成！"
    echo "   → Safari UserScript 已部署至 iCloud"
    echo "   → dist/ 已更新"
fi
