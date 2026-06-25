#!/usr/bin/env bash
set -e

BASE_URL="https://projectsnap-109083270.surge.sh"
INSTALL_DIR="${HOME}/.snapkit"
BIN_DIR="${HOME}/.local/bin"
VERSION="1.0.0"

echo "📦 Installing SnapKit v${VERSION}..."
echo ""

mkdir -p "$INSTALL_DIR" "$INSTALL_DIR/lib" "$BIN_DIR"

# Download main CLI
echo "   Downloading snap..."
curl -fsSL "$BASE_URL/snap.js" -o "$INSTALL_DIR/snap.js"
chmod +x "$INSTALL_DIR/snap.js"

# Download lib modules
for mod in project git env api dep; do
  echo "   Downloading lib/${mod}.js..."
  curl -fsSL "$BASE_URL/lib/${mod}.js" -o "$INSTALL_DIR/lib/${mod}.js"
done

# Create wrapper script
cat > "$BIN_DIR/snap" << 'SCRIPT'
#!/usr/bin/env bash
node "${HOME}/.snapkit/snap.js" "$@"
SCRIPT

chmod +x "$BIN_DIR/snap"

# Also keep backwards compatibility for existing projectsnap users
if [ ! -f "$BIN_DIR/projectsnap" ]; then
  cat > "$BIN_DIR/projectsnap" << 'SCRIPT2'
#!/usr/bin/env bash
node "${HOME}/.snapkit/snap.js" project "$@"
SCRIPT2
  chmod +x "$BIN_DIR/projectsnap"
fi

# Add to PATH if needed
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  SHELL_CONFIG="${HOME}/.$(basename "${SHELL}")rc"
  echo "export PATH=\"\$PATH:$BIN_DIR\"" >> "$SHELL_CONFIG"
  echo ""
  echo "✅ Added $BIN_DIR to PATH in $SHELL_CONFIG"
  echo "   Restart your terminal or run: source $SHELL_CONFIG"
fi

echo ""
echo "✅ SnapKit v${VERSION} installed!"
echo ""
echo "   Usage:"
echo "     snap project [dir]     Generate AI agent project context"
echo "     snap git [options]     Generate structured changelog"
echo "     snap env [dir]         Scan for security issues"
echo "     snap api [dir]         Discover API endpoints"
echo "     snap dep [dir]         Analyze dependencies"
echo ""
echo "   Examples:"
echo "     snap project"
echo "     snap git --since '7 days ago'"
echo "     snap env --strict"
echo "     snap api ./src --json"
echo "     snap dep --offline"
echo ""
echo "   Run 'snap --help' for full documentation."
echo ""
echo "   Works with: Claude Code, Cursor, Codex, OpenCode, Copilot"
