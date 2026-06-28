#!/bin/bash
# Install iMessage Bridge as macOS LaunchAgent (auto-start on login)
#
# Usage:
#   install-launchagent.sh [load|unload|status] [config-path]

set -e

PLIST="com.inddaily.imessage-mcp-server.bridge.plist"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
DEST="$LAUNCH_AGENTS_DIR/$PLIST"
LOG_DIR="$HOME/Library/Logs"
CONFIG_PATH="${2:-}"

# Determine how to run the bridge.
# Prefer npx if available, otherwise fall back to node with this package path.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

if command -v npx >/dev/null 2>&1; then
  RUN_COMMAND="npx"
  RUN_ARGS="-y imessage-mcp-server"
else
  RUN_COMMAND="node"
  RUN_ARGS="$PACKAGE_DIR/bin/imessage-mcp-server"
fi

case "${1:-load}" in
  load)
    echo "📦 Installing iMessage Bridge LaunchAgent..."
    mkdir -p "$LAUNCH_AGENTS_DIR"
    mkdir -p "$LOG_DIR"

    cat > "$DEST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.inddaily.imessage-mcp-server.bridge</string>
  <key>ProgramArguments</key>
  <array>
    <string>$RUN_COMMAND</string>
EOF

    for arg in $RUN_ARGS; do
      echo "    <string>$arg</string>" >> "$DEST"
    done

    echo "    <string>--bridge</string>" >> "$DEST"
    if [ -n "$CONFIG_PATH" ]; then
      echo "    <string>--config</string>" >> "$DEST"
      echo "    <string>$CONFIG_PATH</string>" >> "$DEST"
    fi

    cat >> "$DEST" <<EOF
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>$LOG_DIR/imessage-mcp-server-bridge.log</string>
  <key>StandardErrorPath</key>
  <string>$LOG_DIR/imessage-mcp-server-bridge.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin</string>
  </dict>
</dict>
</plist>
EOF

    launchctl load "$DEST" || launchctl bootstrap gui/"$(id -u)" "$DEST"
    echo "✅ Installed and started!"
    echo "  Log: $LOG_DIR/imessage-mcp-server-bridge.log"
    echo "  Stop: launchctl unload $DEST"
    ;;
  unload)
    echo "🗑️  Uninstalling iMessage Bridge..."
    launchctl unload "$DEST" 2>/dev/null || true
    rm -f "$DEST"
    echo "✅ Uninstalled"
    ;;
  status)
    if launchctl list | grep -q "com.inddaily.imessage-mcp-server.bridge"; then
      echo "🟢 Running"
      launchctl list | grep com.inddaily.imessage-mcp-server.bridge
    else
      echo "🔴 Not running"
    fi
    ;;
  *)
    echo "Usage: $0 [load|unload|status] [config-path]"
    exit 1
    ;;
esac
