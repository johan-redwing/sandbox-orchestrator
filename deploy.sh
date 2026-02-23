#!/usr/bin/env bash
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${CYAN}╔══════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║   Sandbox Console — Production Installer     ║${NC}"
echo -e "${CYAN}║   Intel Xeon 5th Gen · Granite Rapids         ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════╝${NC}"
echo ""

# ── Pre-flight checks ──
check_cmd() { command -v "$1" &>/dev/null || { echo -e "${RED}✗ $1 not found. Please install it first.${NC}"; exit 1; }; }
check_cmd node
check_cmd npm

NODE_MAJOR=$(node -v | cut -d'.' -f1 | tr -d 'v')
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo -e "${RED}✗ Node.js 18+ required (found $(node -v))${NC}"
  exit 1
fi
echo -e "${GREEN}✓${NC} Node.js $(node -v)"
echo -e "${GREEN}✓${NC} npm $(npm -v)"

# ── Locate script directory (where the source files are) ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$SCRIPT_DIR"

# ── Check for .env file ──
if [ ! -f "$INSTALL_DIR/.env" ]; then
  if [ -f "$INSTALL_DIR/.env.example" ]; then
    echo ""
    echo -e "${YELLOW}⚠ No .env file found.${NC}"
    echo -e "  Copy the example and fill in your AWS credentials:"
    echo -e "  ${BOLD}cp .env.example .env${NC}"
    echo -e "  ${BOLD}nano .env${NC}"
    echo ""
    echo -e "  Required variables:"
    echo -e "    AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxx"
    echo -e "    AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
    echo -e "    AWS_DEFAULT_REGION=us-east-1"
    echo -e "    JWT_SECRET=<random-string-32-chars>"
    echo ""
    read -p "  Create .env from template now? [Y/n] " yn
    case "${yn:-Y}" in
      [Yy]* )
        cp "$INSTALL_DIR/.env.example" "$INSTALL_DIR/.env"
        echo -e "  ${GREEN}✓${NC} Created .env — edit it with your credentials before starting."
        echo -e "  ${BOLD}nano $INSTALL_DIR/.env${NC}"
        echo ""
        read -p "  Press Enter after editing .env to continue..." _
        ;;
      * )
        echo -e "  ${RED}Cannot proceed without .env file.${NC}"
        exit 1
        ;;
    esac
  else
    echo -e "${RED}✗ No .env or .env.example found.${NC}"
    exit 1
  fi
fi

# Validate .env has real values
source "$INSTALL_DIR/.env" 2>/dev/null || true
if [ "${AWS_ACCESS_KEY_ID:-}" = "your-access-key-id" ] || [ -z "${AWS_ACCESS_KEY_ID:-}" ]; then
  echo -e "${RED}✗ AWS_ACCESS_KEY_ID not set in .env — edit the file first.${NC}"
  exit 1
fi
echo -e "${GREEN}✓${NC} .env loaded (region: ${AWS_DEFAULT_REGION:-us-east-1})"

# ── Install dependencies ──
echo ""
echo -e "${CYAN}Installing dependencies...${NC}"
cd "$INSTALL_DIR"
npm install 2>&1 | tail -5
echo -e "${GREEN}✓${NC} Dependencies installed"

# ── Choose mode ──
echo ""
echo -e "${BOLD}How would you like to run?${NC}"
echo -e "  ${CYAN}1)${NC} Development mode — React hot-reload (:5173) + API (:3000)"
echo -e "  ${CYAN}2)${NC} Production mode  — Optimized build (:3000 serves everything)"
echo ""
read -p "Choose [1/2]: " MODE

case "${MODE:-1}" in
  1)
    echo ""
    echo -e "${GREEN}Starting in development mode...${NC}"
    echo -e "  Frontend: ${BOLD}http://localhost:5173${NC}"
    echo -e "  API:      ${BOLD}http://localhost:3000${NC}"
    echo ""
    echo -e "${YELLOW}┌──────────────────────────────────────────────┐${NC}"
    echo -e "${YELLOW}│ FIRST RUN: Log in as admin and click          │${NC}"
    echo -e "${YELLOW}│ 'Initialize Infrastructure' to create VPC     │${NC}"
    echo -e "${YELLOW}└──────────────────────────────────────────────┘${NC}"
    echo ""
    npx concurrently "node server/index.js" "npx vite --host 0.0.0.0"
    ;;
  2)
    echo ""
    echo -e "${CYAN}Building production frontend...${NC}"
    npx vite build
    echo -e "${GREEN}✓${NC} Frontend built to dist/"
    echo ""
    echo -e "${GREEN}Starting production server...${NC}"
    echo -e "  URL: ${BOLD}http://localhost:${PORT:-3000}${NC}"
    echo ""
    echo -e "${YELLOW}┌──────────────────────────────────────────────┐${NC}"
    echo -e "${YELLOW}│ FIRST RUN: Log in as admin and click          │${NC}"
    echo -e "${YELLOW}│ 'Initialize Infrastructure' to create VPC     │${NC}"
    echo -e "${YELLOW}└──────────────────────────────────────────────┘${NC}"
    echo ""
    NODE_ENV=production node server/index.js
    ;;
  *)
    echo -e "${RED}Invalid choice${NC}"
    exit 1
    ;;
esac
