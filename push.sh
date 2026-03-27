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

    # Build extension.zip for Chrome Web Store（從 extension/ 內打包，確保 manifest 在根目錄）
    EXT_DIR="$SCRIPT_DIR/dist/extension"
    ZIP_FILE="$SCRIPT_DIR/dist/extension.zip"
    if [ -d "$EXT_DIR" ]; then
        rm -f "$ZIP_FILE"
        (cd "$EXT_DIR" && zip -qr "$ZIP_FILE" .)
        echo "📦 Chrome Extension ZIP: $ZIP_FILE"
    fi

    # ── Step 5: Chrome Web Store 自動上傳 ──────────────────────
    ENV_FILE="$SCRIPT_DIR/.env"
    if [ -f "$ENV_FILE" ]; then
        source "$ENV_FILE"
    fi

    if [ -z "$CWS_CLIENT_ID" ] || [ -z "$CWS_CLIENT_SECRET" ] || [ -z "$CWS_REFRESH_TOKEN" ]; then
        echo "⚠️  缺少 CWS 憑證（.env），跳過 Chrome Web Store 上傳"
    else
        CWS_EXT_ID="goibhoemcnjojlejjlojpikfehmccbbj"
        echo "🌐 取得 Chrome Web Store access token..."
        ACCESS_TOKEN=$(curl -s -X POST https://oauth2.googleapis.com/token \
            -d "client_id=$CWS_CLIENT_ID" \
            -d "client_secret=$CWS_CLIENT_SECRET" \
            -d "refresh_token=$CWS_REFRESH_TOKEN" \
            -d "grant_type=refresh_token" \
            | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))")

        if [ -z "$ACCESS_TOKEN" ]; then
            echo "❌ 無法取得 access token，跳過上傳"
        else
            # 從 CHANGELOG.md 擷取最新版本的 changelog
            CHANGELOG_TEXT=$(python3 -c "
import re, sys
with open('CHANGELOG.md', encoding='utf-8') as f:
    content = f.read()
# 取第一個 ## 區塊的內文
blocks = re.split(r'^## ', content, flags=re.MULTILINE)
if len(blocks) > 1:
    lines = blocks[1].strip().split('\n')
    # 移除標題行（第一行是版本標題）
    body = '\n'.join(lines[1:]).strip()
    print(body[:1000])  # CWS 限制 1000 字
")
            CWS_BOUNDARY="CWS_PUSH_BOUNDARY"
            # 組合 multipart body（metadata + zip），帶入 changelog
            python3 - << PYEOF
import json, os
metadata = json.dumps({
    "kind": "chromewebstore#item",
    "id": "$CWS_EXT_ID",
    "localeName": "zh-TW",
    "changeDescription": """$CHANGELOG_TEXT"""
}, ensure_ascii=False)
boundary = "$CWS_BOUNDARY"
with open("$ZIP_FILE", "rb") as zf:
    zip_data = zf.read()
body = (
    f"--{boundary}\r\nContent-Type: application/json\r\n\r\n{metadata}\r\n"
    f"--{boundary}\r\nContent-Type: application/zip\r\n\r\n"
).encode("utf-8") + zip_data + f"\r\n--{boundary}--\r\n".encode("utf-8")
with open("/tmp/cws_push.bin", "wb") as f:
    f.write(body)
PYEOF

            echo "📤 上傳 ZIP + changelog 至 Chrome Web Store..."
            UPLOAD_RESULT=$(curl -s -X PUT \
                "https://www.googleapis.com/upload/chromewebstore/v1.1/items/$CWS_EXT_ID?uploadType=multipart" \
                -H "Authorization: Bearer $ACCESS_TOKEN" \
                -H "x-goog-api-version: 2" \
                -H "Content-Type: multipart/related; boundary=$CWS_BOUNDARY" \
                --data-binary @/tmp/cws_push.bin)
            UPLOAD_STATE=$(echo "$UPLOAD_RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin).get('uploadState','UNKNOWN'))" 2>/dev/null)
            echo "   上傳狀態: $UPLOAD_STATE"

            if [ "$UPLOAD_STATE" == "SUCCESS" ]; then
                echo "🚀 發布至 Chrome Web Store..."
                PUB_RESULT=$(curl -s -X POST \
                    "https://www.googleapis.com/chromewebstore/v1.1/items/$CWS_EXT_ID/publish" \
                    -H "Authorization: Bearer $ACCESS_TOKEN" \
                    -H "x-goog-api-version: 2" \
                    -H "Content-Length: 0")
                PUB_STATUS=$(echo "$PUB_RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status',['UNKNOWN'])[0])" 2>/dev/null)
                echo "   發布狀態: $PUB_STATUS"
                echo "✅ Chrome Web Store 上傳並送審完成！"
            else
                echo "❌ 上傳失敗: $UPLOAD_RESULT"
            fi
        fi
    fi

    echo ""
    echo "✅ 正式版 $TAG_NAME 發佈完成！"
    echo "   → GitHub Release: 檢查 Actions tab"
    echo "   → Chrome Web Store: 已自動送審"
else
    echo ""
    echo "✅ Beta $TAG_NAME 推送完成！"
    echo "   → Safari UserScript 已部署至 iCloud"
    echo "   → dist/ 已更新"
fi
