/**
 * snap env — scan project for env/secret security issues
 *
 * Checks:
 * 1. .env file exists and is in .gitignore
 * 2. .env.example vs .env variable mismatch
 * 3. Hardcoded secrets in source files (API keys, tokens, passwords, private keys)
 * 4. Common credential file patterns
 *
 * Outputs a security report with severity levels.
 */

const fs = require('fs');
const path = require('path');

exports.run = function (args) {
  const targetDir = args[0] || process.cwd();
  const showHelp = args.includes('--help') || args.includes('-h');
  const strict = args.includes('--strict');
  const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;

  if (showHelp) {
    console.log(`
  snap env — scan project for env/secret security issues

  Usage:
    snap env [dir]           Scan directory (default: current)
    snap env --strict        Also flag suspicious patterns (e.g. test keys)
    snap env --out FILE      Write report to file
    snap env --help          Show this help

  Examples:
    snap env
    snap env ./my-project --strict
    snap env --out security-report.md
    `);
    return;
  }

  const absDir = path.resolve(targetDir);
  if (!fs.existsSync(absDir)) {
    console.error(`❌ Directory not found: ${targetDir}`);
    process.exit(1);
  }

  console.error('🔐 Scanning for security issues...');

  const report = runScan(absDir, { strict });
  const output = renderReport(report);

  if (outFile) {
    fs.writeFileSync(path.resolve(outFile), output, 'utf8');
    console.error(`✅ Report written to ${outFile}`);
  } else {
    console.log(output);
  }

  // Summary on stderr
  const totalIssues = report.issues.length;
  const errors = report.issues.filter(i => i.severity === 'error').length;
  const warnings = report.issues.filter(i => i.severity === 'warning').length;
  const infos = report.issues.filter(i => i.severity === 'info').length;

  console.error(`\n📊 ${totalIssues} issue(s) found:`);
  if (errors > 0) console.error(`   ❌ ${errors} error(s)`);
  if (warnings > 0) console.error(`   ⚠️  ${warnings} warning(s)`);
  if (infos > 0) console.error(`   ℹ️  ${infos} info`);
};

// Regex patterns for secret detection
const SECRET_PATTERNS = [
  // AWS
  { pattern: /(?:AKIA|ASIA)[0-9A-Z]{16}/g, label: 'AWS Access Key ID', severity: 'error' },
  { pattern: /(?:['\"])?(?:aws_access_key_id|aws_secret_access_key)(?:['\"])?\s*[:=]\s*['\"][A-Za-z0-9\/+%=_-]{16,}['\"]/g, label: 'AWS Credential Assignment', severity: 'error' },
  // Private keys
  { pattern: /-----BEGIN\s?(?:RSA|DSA|EC|OPENSSH|PGP)?\s?PRIVATE KEY-----/g, label: 'Private Key', severity: 'error' },
  // API Keys / Tokens - generic but high entropy
  { pattern: /(?:api[_-]?key|api[_-]?token|apikey|secret[_-]?key|secret[_-]?token|access[_-]?token|auth[_-]?token)\s*[:=]\s*['\"][A-Za-z0-9_\-\.]{16,}['\"]/gi, label: 'API Key / Token', severity: 'error' },
  // JWT
  { pattern: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, label: 'JWT Token', severity: 'error' },
  // GitHub tokens
  { pattern: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}/g, label: 'GitHub Token', severity: 'error' },
  // Slack tokens
  { pattern: /xox[baprs]-[0-9A-Za-z-]{10,}/g, label: 'Slack Token', severity: 'error' },
  // Password assignments in code
  { pattern: /(?:password|passwd|pwd)\s*[:=]\s*['\"][^'\"\s]{8,}['\"]/gi, label: 'Hardcoded Password', severity: 'error' },
  // Connection strings
  { pattern: new RegExp('(?:postgres|mysql|mongodb|redis)://[A-Za-z0-9_%-]+:[A-Za-z0-9_%-]+@', 'gi'), label: 'Database Connection String with Credentials', severity: 'error' },
  // Stripe
  { pattern: /sk_live_[0-9A-Za-z]{20,}/g, label: 'Stripe Live Secret Key', severity: 'error' },
  { pattern: /pk_live_[0-9A-Za-z]{20,}/g, label: 'Stripe Live Publishable Key', severity: 'warning' },
  // Firebase
  { pattern: /AIzaSy[A-Za-z0-9_-]{26,}/g, label: 'Firebase API Key', severity: 'warning' },
];

const STRICT_PATTERNS = [
  { pattern: /(?:sk_test|pk_test)_[0-9A-Za-z]{20,}/g, label: 'Stripe Test Key', severity: 'info' },
  { pattern: /(?:secret|token|key|password|credential)\s*[:=]\s*['\"][^'\"\s]{8,}['\"]/gi, label: 'Potential Secret Assignment', severity: 'info' },
];

// Files to check for .env
const ENV_FILES = ['.env', '.env.local', '.env.development', '.env.production', '.env.staging'];

function findEnvFiles(dir) {
  const found = [];
  for (const f of ENV_FILES) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) {
      found.push(f);
    }
  }
  return found;
}

function parseEnvFile(filePath) {
  const vars = {};
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      if (key) vars[key] = trimmed.slice(eqIdx + 1).trim();
    }
  } catch {}
  return vars;
}

function isInGitignore(dir) {
  const gitignorePath = path.join(dir, '.gitignore');
  if (!fs.existsSync(gitignorePath)) return false;
  const content = fs.readFileSync(gitignorePath, 'utf8');
  const lines = content.split('\n').map(l => l.trim());
  return lines.some(l => l === '.env' || l === '.env.*' || l === '.env*');
}

function findSourceFiles(dir) {
  const sourceFiles = [];
  const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'target', '.next', '.nuxt', '__pycache__', '.venv', 'venv', '.cache', 'coverage', 'vendor', '.gradle', '.idea']);
  const EXT_WHITELIST = new Set(['.js', '.jsx', '.ts', '.tsx', '.py', '.rb', '.php', '.go', '.rs', '.java', '.kt', '.swift', '.cs', '.cpp', '.c', '.h', '.sh', '.bash', '.zsh', '.yaml', '.yml', '.json', '.env', '.env.example', '.env.local', '.toml', '.cfg', '.conf', '.ini', '.config', '.vue', '.svelte', '.astro']);

  function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      const full = path.join(d, entry.name);
      try {
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && EXT_WHITELIST.has(path.extname(entry.name).toLowerCase())) {
          sourceFiles.push(full);
        }
      } catch {}
    }
  }
  walk(dir);
  return sourceFiles;
}

function scanFile(filePath, patterns) {
  const issues = [];
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return issues;
  }

  const lines = content.split('\n');
  for (const { pattern, label, severity } of patterns) {
    // Reset regex
    pattern.lastIndex = 0;
    for (let i = 0; i < lines.length; i++) {
      pattern.lastIndex = 0;
      const match = pattern.exec(lines[i]);
      if (match) {
        const relPath = path.relative(process.cwd(), filePath);
        // Mask the secret in output
        const masked = match[0].length > 12
          ? match[0].slice(0, 8) + '…' + match[0].slice(-4)
          : '****';
        issues.push({
          severity,
          label,
          file: relPath,
          line: i + 1,
          match: masked,
          context: lines[i].substring(0, 120).trim(),
        });
      }
    }
  }
  return issues;
}

function runScan(dir, { strict }) {
  const issues = [];
  const warnings = [];

  // 1. Check .env presence
  const envFiles = findEnvFiles(dir);
  if (envFiles.length === 0) {
    const envExample = path.join(dir, '.env.example');
    if (fs.existsSync(envExample)) {
      issues.push({ severity: 'warning', category: 'env', message: 'No .env file found (but .env.example exists). Create .env from .env.example' });
    } else {
      issues.push({ severity: 'info', category: 'env', message: 'No .env file found. If this project uses environment variables, create one.' });
    }
  }

  // 2. Check .gitignore
  const gitignoreStatus = isInGitignore(dir);
  for (const envFile of envFiles) {
    if (!gitignoreStatus) {
      issues.push({ severity: 'error', category: 'env', message: `.env file (${envFile}) is NOT in .gitignore — risk of committing secrets` });
    }
  }
  if (envFiles.length > 0 && gitignoreStatus) {
    warnings.push({ severity: 'info', category: 'env', message: '✅ .env files are in .gitignore' });
  }

  // 3. .env.example vs .env variable mismatch
  const envExamplePath = path.join(dir, '.env.example');
  if (fs.existsSync(envExamplePath)) {
    const exampleVars = parseEnvFile(envExamplePath);
    const exampleKeys = Object.keys(exampleVars);
    if (exampleKeys.length > 0 && envFiles.length > 0) {
      const envVars = parseEnvFile(path.join(dir, envFiles[0]));
      const missing = exampleKeys.filter(k => !(k in envVars));
      const extra = Object.keys(envVars).filter(k => !exampleKeys.includes(k) && exampleVars[k] === undefined);
      for (const k of missing) {
        issues.push({ severity: 'warning', category: 'env', message: `Missing env var "${k}" — declared in .env.example but not in ${envFiles[0]}` });
      }
      for (const k of extra) {
        issues.push({ severity: 'info', category: 'env', message: `Extra env var "${k}" in ${envFiles[0]} but not in .env.example` });
      }
    }
  }

  // 4. Scan source files for hardcoded secrets
  const sourceFiles = findSourceFiles(dir);
  const patterns = [...SECRET_PATTERNS];
  if (strict) patterns.push(...STRICT_PATTERNS);

  for (const file of sourceFiles) {
    const fileIssues = scanFile(file, patterns);
    issues.push(...fileIssues.map(i => ({
      severity: i.severity,
      category: 'secret',
      message: `${i.label} found at ${i.file}:${i.line}`,
      file: i.file,
      line: i.line,
      match: i.match,
      context: i.context,
    })));
  }

  // 5. Check for common dangerous files
  const DANGEROUS_FILES = [
    { name: 'credentials.json', severity: 'error', desc: 'AWS/GCP credential file' },
    { name: 'config.json', severity: 'info', desc: 'Config file (check for secrets)' },
    { name: 'service-account.json', severity: 'error', desc: 'Service account key file' },
    { name: 'saml.pem', severity: 'error', desc: 'SAML certificate file' },
    { name: '*.key', severity: 'warning', desc: 'Private key file' },
    { name: 'id_rsa', severity: 'error', desc: 'SSH private key' },
  ];

  for (const df of DANGEROUS_FILES) {
    if (df.name.includes('*')) {
      // Glob-like check
      const pattern = df.name.replace('*', '');
      try {
        const all = fs.readdirSync(dir);
        for (const f of all) {
          if (f.endsWith(pattern) && !f.startsWith('.')) {
            issues.push({ severity: df.severity, category: 'dangerous-file', message: `${df.desc}: ${f} (${df.severity === 'error' ? 'commit risk' : 'check contents'})` });
          }
        }
      } catch {}
    } else {
      const p = path.join(dir, df.name);
      if (fs.existsSync(p)) {
        issues.push({ severity: df.severity, category: 'dangerous-file', message: `${df.desc}: ${df.name}` });
      }
    }
  }

  // Sort: errors first, then warnings, then info
  issues.sort((a, b) => {
    const order = { error: 0, warning: 1, info: 2 };
    return (order[a.severity] || 3) - (order[b.severity] || 3);
  });

  return { issues, warnings, summary: { filesScanned: sourceFiles.length, envFilesFound: envFiles.length, totalIssues: issues.length } };
}

function renderReport(report) {
  let output = '# 🔐 Env Security Report\n\n';

  output += `## Summary\n\n`;
  output += `- Files scanned: ${report.summary.filesScanned}\n`;
  output += `- Env files found: ${report.summary.envFilesFound}\n`;
  output += `- Issues found: ${report.summary.totalIssues}\n\n`;

  if (report.warnings.length > 0) {
    output += `## ✅ Passed Checks\n\n`;
    for (const w of report.warnings) {
      output += `- ${w.message}\n`;
    }
    output += '\n';
  }

  const byCategory = {};
  for (const issue of report.issues) {
    const cat = issue.category || 'other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(issue);
  }

  const CAT_LABELS = {
    env: 'Environment Variables',
    secret: 'Hardcoded Secrets',
    'dangerous-file': 'Dangerous Files',
  };

  for (const [cat, catIssues] of Object.entries(byCategory)) {
    output += `## ${CAT_LABELS[cat] || cat}\n\n`;
    for (const issue of catIssues) {
      const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : 'ℹ️';
      output += `- ${icon} **${issue.severity.toUpperCase()}**: ${issue.message}\n`;
      if (issue.context) {
        output += `  _\`${issue.context}\`_\n`;
      }
    }
    output += '\n';
  }

  return output;
}

exports._test = { isInGitignore, parseEnvFile, scanFile, findSourceFiles, SECRET_PATTERNS, runScan };
