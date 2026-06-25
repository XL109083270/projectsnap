/**
 * snap git — generate structured changelog from git history
 *
 * Scans the current repo's git log and outputs a grouped changelog
 * (feat, fix, docs, refactor, style, perf, test, chore, other).
 *
 * Requires: git installed, called from inside a git repo.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

exports.run = function (args) {
  const showHelp = args.includes('--help') || args.includes('-h');
  const format = args.includes('--json') ? 'json' : 'markdown';
  const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : null;
  const until = args.includes('--until') ? args[args.indexOf('--until') + 1] : null;
  const fromTag = args.includes('--from') ? args[args.indexOf('--from') + 1] : null;
  const toTag = args.includes('--to') ? args[args.indexOf('--to') + 1] : null;
  const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
  const author = args.includes('--author') ? args[args.indexOf('--author') + 1] : null;

  if (showHelp) {
    console.log(`
  snap git — generate structured changelog from git history

  Usage:
    snap git [options]

  Options:
    --since "<time>"    Commits after date (e.g. "7 days ago", "2024-01-01")
    --until "<time>"    Commits before date (e.g. "yesterday")
    --from <tag>        Commits from this tag (inclusive)
    --to <tag>          Commits up to this tag (inclusive)
    --author <name>     Filter by author
    --json              Output as JSON instead of markdown
    --out <file>        Write output to file
    --help, -h          Show this help

  Examples:
    snap git
    snap git --since "7 days ago"
    snap git --from v1.0.0 --to v2.0.0 --json
    snap git --since "2024-01-01" --author "Alice"
    `);
    return;
  }

  // Check if we're in a git repo
  try {
    execSync('git rev-parse --git-dir', { stdio: 'pipe' });
  } catch {
    console.error('❌ Not a git repository (or no git installed)');
    process.exit(1);
  }

  console.error('📜 Reading git history...');

  const commits = getCommits({ since, until, fromTag, toTag, author });
  if (commits.length === 0) {
    console.log('No commits found matching the criteria.');
    return;
  }

  const grouped = groupCommits(commits);
  const stats = computeStats(commits, grouped);

  if (format === 'json') {
    const output = JSON.stringify({ commits, grouped, stats }, null, 2);
    if (outFile) {
      fs.writeFileSync(path.resolve(outFile), output, 'utf8');
      console.error(`✅ Changelog written to ${outFile} (${formatBytes(Buffer.byteLength(output))})`);
    } else {
      console.log(output);
    }
  } else {
    const output = renderMarkdown(grouped, stats);
    if (outFile) {
      fs.writeFileSync(path.resolve(outFile), output, 'utf8');
      console.error(`✅ Changelog written to ${outFile} (${formatBytes(Buffer.byteLength(output))})`);
    } else {
      console.log(output);
    }
  }

  logStats(stats);
};

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getCommits({ since, until, fromTag, toTag, author }) {
  // Build git log format: hash|author|date|subject|body
  let args = ['log', '--no-merges', '--format=%H|%an|%ai|%s|%b'];

  if (fromTag && toTag) {
    args.push(`${fromTag}..${toTag}`);
  } else if (fromTag) {
    args.push(`${fromTag}..HEAD`);
  } else if (toTag) {
    args.push(`--not`, `${toTag}^1`, toTag);
  }

  if (since) args.push(`--since="${since}"`);
  if (until) args.push(`--until="${until}"`);
  if (author) args.push(`--author=${author}`);

  try {
    const raw = execSync(`git ${args.join(' ')}`, { stdio: 'pipe', maxBuffer: 10 * 1024 * 1024 }).toString().trim();
    if (!raw) return [];

    return raw.split('\n').map(line => {
      const parts = line.split('|');
      const bodyParts = parts.slice(4).join('|'); // body might contain |
      return {
        hash: parts[0] || '',
        author: parts[1] || '',
        date: parts[2] || '',
        subject: parts[3] || '',
        body: bodyParts || '',
      };
    });
  } catch (e) {
    console.error('⚠️  Could not read git log:', e.message);
    return [];
  }
}

/**
 * Conventional commit pattern:
 *   type(scope): description
 *
 * Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
 * Breaking changes: "!" before ":" or "BREAKING CHANGE" in body
 */
const CONVENTIONAL_RE = /^(\w+)(\([^)]+\))?(!)?\s*:\s*(.*)/;

function parseConventional(subject) {
  const match = subject.match(CONVENTIONAL_RE);
  if (!match) return { type: 'other', scope: null, breaking: false, description: subject };
  return {
    type: match[1].toLowerCase(),
    scope: match[2] ? match[2].slice(1, -1) : null,
    breaking: match[3] === '!' || false,
    description: match[4],
  };
}

function groupCommits(commits) {
  const TYPE_ORDER = ['breaking', 'feat', 'fix', 'perf', 'refactor', 'docs', 'style', 'test', 'build', 'ci', 'chore', 'revert', 'other'];
  const TYPE_LABELS = {
    breaking: '⚠️  Breaking Changes',
    feat: '🚀 Features',
    fix: '🐛 Bug Fixes',
    perf: '⚡ Performance',
    refactor: '♻️  Refactors',
    docs: '📝 Documentation',
    style: '🎨 Style',
    test: '🧪 Tests',
    build: '📦 Build',
    ci: '👷 CI',
    chore: '🔧 Chores',
    revert: '⏪ Reverts',
    other: '📋 Other',
  };

  const groups = {};
  for (const type of TYPE_ORDER) groups[type] = [];

  for (const commit of commits) {
    const parsed = parseConventional(commit.subject);
    let type = parsed.type;

    // Breaking changes get their own group
    if (parsed.breaking || /BREAKING CHANGE/i.test(commit.body)) {
      type = 'breaking';
    } else if (!TYPE_LABELS[type]) {
      type = 'other';
    }

    groups[type].push({ ...commit, parsed });
  }

  // Remove empty groups, keep order
  const result = [];
  for (const type of TYPE_ORDER) {
    if (groups[type].length > 0) {
      result.push({ type, label: TYPE_LABELS[type], commits: groups[type] });
    }
  }
  return result;
}

function computeStats(commits, grouped) {
  const totalAuthors = new Set(commits.map(c => c.author));
  const dateRange = commits.length > 0
    ? { from: commits[commits.length - 1].date.slice(0, 10), to: commits[0].date.slice(0, 10) }
    : null;

  return {
    totalCommits: commits.length,
    totalAuthors: totalAuthors.size,
    authors: [...totalAuthors],
    dateRange,
    groups: grouped.map(g => ({ type: g.type, count: g.commits.length })),
  };
}

function renderMarkdown(grouped, stats) {
  let md = `# Changelog\n\n`;

  if (stats.dateRange) {
    md += `**${stats.dateRange.from} → ${stats.dateRange.to}** · `;
  }
  md += `${stats.totalCommits} commits · ${stats.totalAuthors} contributors\n\n`;

  for (const group of grouped) {
    md += `## ${group.label}\n\n`;
    for (const commit of group.commits) {
      const hashShort = commit.hash.slice(0, 7);
      const desc = commit.parsed ? commit.parsed.description : commit.subject;
      const scope = commit.parsed && commit.parsed.scope ? `**${commit.parsed.scope}**: ` : '';
      md += `- \`${hashShort}\` ${scope}${desc}\n`;
    }
    md += '\n';
  }

  return md;
}

function logStats(stats) {
  console.error(`📊 ${stats.totalCommits} commits, ${stats.totalAuthors} contributors`);
  if (stats.dateRange) {
    console.error(`📅 ${stats.dateRange.from} → ${stats.dateRange.to}`);
  }
  for (const g of stats.groups) {
    console.error(`   ${g.type}: ${g.count}`);
  }
}

exports._test = { parseConventional, groupCommits, getCommits };
