#!/bin/bash
# SHELL_SYNC.sh — Force-sync entire project to GitHub
# Run from project root: bash scripts/SHELL_SYNC.sh
# Requires GITHUB_TOKEN to be set in environment

set -e

echo "🔄 StrikerX GitHub Sync"
echo "========================"

# Verify token
if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ GITHUB_TOKEN is not set"
  exit 1
fi

# Get GitHub username
USERNAME=$(curl -s -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user | grep '"login"' | head -1 | sed 's/.*"login": *"\([^"]*\)".*/\1/')
if [ -z "$USERNAME" ]; then
  echo "❌ Failed to get GitHub username"
  exit 1
fi
echo "✅ Authenticated as: $USERNAME"

REPO_URL="https://$USERNAME:$GITHUB_TOKEN@github.com/$USERNAME/strikerx.git"

# Initialize git if needed
if [ ! -d ".git" ]; then
  echo "📁 Initializing git repository..."
  git init
  git branch -M main
fi

# Configure git
git config user.email "strikerx-bot@replit.dev" 2>/dev/null || true
git config user.name "StrikerX Agent" 2>/dev/null || true

# Set or update remote
if git remote get-url origin 2>/dev/null; then
  git remote set-url origin "$REPO_URL"
else
  git remote add origin "$REPO_URL"
fi

# Create/update .gitignore
cat > .gitignore << 'EOF'
node_modules/
.env
dist/
build/
__pycache__/
*.tsbuildinfo
.DS_Store
EOF

# Stage all
git add -A

# Commit
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
git commit -m "sync: $TIMESTAMP" --allow-empty

# Push
echo "🚀 Pushing to GitHub..."
git push -u origin main --force

echo ""
echo "✅ Sync complete: https://github.com/$USERNAME/strikerx"
