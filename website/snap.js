#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const commands = {
  project: require('./lib/project'),
  git: require('./lib/git'),
  env: require('./lib/env'),
  api: require('./lib/api'),
  dep: require('./lib/dep'),
};

const args = process.argv.slice(2);
const cmd = args[0];

if (!cmd || cmd === '--help' || cmd === '-h') {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
  console.log(`
  ${pkg.name} v${pkg.version} — ${pkg.description}

  Usage:
    snap <command> [options]

  Commands:
    project   Scan project structure for AI agent context
    git       Generate structured changelog from git history
    env       Scan project for env/secret security issues
    api       Discover API endpoints in project source
    dep       Analyze project dependencies

  Options:
    --help, -h    Show this help

  Examples:
    snap project
    snap git --since "7 days ago"
    snap env --strict
    snap api --format json
    snap dep --out report.md
  `);
  process.exit(0);
}

const handler = commands[cmd];
if (!handler) {
  console.error(`❌ Unknown command: "${cmd}"`);
  console.error(`   Run "snap --help" for available commands`);
  process.exit(1);
}

handler.run(args.slice(1));
