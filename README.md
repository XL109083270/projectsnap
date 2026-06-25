# SnapKit 🛠️

**5 essential CLI tools for developers who use AI agents.**

```
snap project   →  AI-ready project context
snap git       →  structured changelog from git history
snap env       →  security scan for secrets & env vars
snap api       →  discover API endpoints in your project
snap dep       →  analyze project dependencies
```

One command to install. Works with Claude Code, Cursor, Codex, OpenCode, Copilot.

## Install

```bash
curl -fsSL https://projectsnap-109083270.surge.sh/install.sh | sh
```

Or from source:
```bash
git clone https://github.com/XL109083270/projectsnap.git
cd projectsnap/snapkit
node snap.js --help
```

## Usage

```bash
# Project context — your AI agent reads your project instantly
snap project

# Git changelog — structured release notes in 3 seconds
snap git --since "7 days ago"

# Security scan — catch leaks before you commit
snap env --strict

# API discovery — never lose track of your routes
snap api

# Dependency health — outdated, unused, redundant
snap dep --offline
```

## Why SnapKit?

Every tool solves a real problem that developers face daily with AI coding agents:

- **snap project** — Stop burning $200/mo on context re-reads. One command generates a structured map your agent reads instantly.
- **snap git** — No more manually writing changelogs. Grouped by type (feat, fix, perf…), markdown or JSON.
- **snap env** — One accidental .env commit can cost you everything. 30+ secret patterns detected.
- **snap api** — Joining a new project? 10 seconds to see every API route, every framework.
- **snap dep** — Healthy dependencies = fewer production surprises. Multi-language support.

## License

MIT

## Pro

A persistent MCP server (`snap serve`) with real-time project context, cross-session memory, and team workspaces is in development. [Sign up for updates](mailto:support@projectsnap.dev?subject=Pro%20updates).
