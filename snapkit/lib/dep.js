/**
 * snap dep — analyze project dependencies
 *
 * Scans project dependency files (package.json, requirements.txt, etc.)
 * and reports:
 * - Outdated packages (via npm registry check)
 * - Redundant/duplicate dependencies
 * - Unused dependencies
 * - Missing peer dependencies
 * - Bundle-size heavy packages
 * - Security notes
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

exports.run = function (args) {
  const targetDir = args[0] || process.cwd();
  const showHelp = args.includes('--help') || args.includes('-h');
  const format = args.includes('--json') ? 'json' : 'table';
  const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
  const offline = args.includes('--offline');
  const noDev = args.includes('--no-dev');

  if (showHelp) {
    console.log(`
  snap dep — analyze project dependencies

  Usage:
    snap dep [dir]              Analyze dependencies (default: current)
    snap dep --json             Output as JSON
    snap dep --out FILE         Write output to file
    snap dep --offline          Skip online checks (outdated versions)
    snap dep --no-dev           Skip devDependencies
    snap dep --help             Show this help

  Examples:
    snap dep
    snap dep ./frontend --json
    snap dep --offline --out dep-report.md
    `);
    return;
  }

  const absDir = path.resolve(targetDir);
  if (!fs.existsSync(absDir)) {
    console.error(`❌ Directory not found: ${targetDir}`);
    process.exit(1);
  }

  console.error('📦 Analyzing dependencies...');

  const report = analyzeDeps(absDir, { offline, noDev });
  const output = renderReport(report, format);

  if (outFile) {
    fs.writeFileSync(path.resolve(outFile), output, 'utf8');
    console.error(`✅ Report written to ${outFile}`);
  } else {
    console.log(output);
  }

  // Summary
  const totalWarnings = report.outdated.length + report.unused.length + report.missingPeers.length + report.redundant.length;
  console.error(`\n📊 Analysis complete:`);
  console.error(`   📦 ${report.packages} packages (${report.depTypes.join(', ')})`);
  console.error(`   🔴 ${report.outdated.length} outdated`);
  console.error(`   ⚠️  ${report.redundant.length} redundant`);
  console.error(`   ℹ️  ${report.unused.length} possibly unused`);
  if (report.missingPeers.length > 0) console.error(`   ❓ ${report.missingPeers.length} missing peer deps`);
};

function analyzeDeps(dir, { offline, noDev }) {
  const report = {
    packages: 0,
    depTypes: [],
    dependencies: [],
    outdated: [],
    redundant: [],
    unused: [],
    missingPeers: [],
    biggest: [],
    errors: [],
  };

  // Check for package.json (Node.js)
  const pkgJsonPath = path.join(dir, 'package.json');
  if (fs.existsSync(pkgJsonPath)) {
    analyzeNodeDeps(pkgJsonPath, dir, report, { offline, noDev });
  }

  // Check for poetry / requirements.txt
  const requirementsPath = path.join(dir, 'requirements.txt');
  if (fs.existsSync(requirementsPath)) {
    analyzePythonDeps(requirementsPath, report);
  }

  // Check for Cargo.toml
  const cargoPath = path.join(dir, 'Cargo.toml');
  if (fs.existsSync(cargoPath)) {
    analyzeCargoDeps(cargoPath, report);
  }

  // Check for go.mod
  const goModPath = path.join(dir, 'go.mod');
  if (fs.existsSync(goModPath)) {
    analyzeGoDeps(goModPath, report);
  }

  // Sort biggest by size
  report.biggest.sort((a, b) => b.size - a.size);

  return report;
}

function analyzeNodeDeps(pkgJsonPath, dir, report, { offline, noDev }) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
  } catch {
    report.errors.push('Could not parse package.json');
    return;
  }

  const deps = { ...(pkg.dependencies || {}) };
  const devDeps = pkg.devDependencies || {};
  const peerDeps = pkg.peerDependencies || {};
  const allDeps = { ...deps, ...devDeps };

  report.depTypes = [];
  if (Object.keys(deps).length > 0) report.depTypes.push(`${Object.keys(deps).length} dependencies`);
  if (Object.keys(devDeps).length > 0) report.depTypes.push(`${Object.keys(devDeps).length} devDependencies`);
  if (Object.keys(peerDeps).length > 0) report.depTypes.push(`${Object.keys(peerDeps).length} peerDependencies`);
  report.packages = Object.keys(allDeps).length;

  // Record all dependencies
  for (const [name, version] of Object.entries(allDeps)) {
    const isDev = name in devDeps;
    if (noDev && isDev) continue;
    report.dependencies.push({
      name,
      version: version.replace(/^[\^~]/, ''),
      range: version,
      type: isDev ? 'dev' : 'prod',
    });
  }

  // 1. Check outdated versions (online)
  if (!offline && Object.keys(deps).length > 0) {
    const names = Object.keys(deps).slice(0, 30); // limit to avoid rate limiting
    for (const name of names) {
      try {
        const result = execSync(`npm view "${name}" version --json 2>/dev/null`, {
          stdio: 'pipe',
          timeout: 5000,
        }).toString().trim();
        let latest;
        try {
          latest = JSON.parse(result);
          if (Array.isArray(latest)) latest = latest[latest.length - 1];
        } catch {
          latest = result;
        }

        const current = deps[name].replace(/^[\^~]/, '');
        if (latest && current !== latest) {
          report.outdated.push({
            name,
            current,
            latest: String(latest),
            type: 'prod',
            severity: isMajorBump(current, String(latest)) ? 'major' : 'minor',
          });
        }
      } catch {
        // Network error or package not found — skip
      }
    }
  }

  // 2. Check redundant: same dep in both deps and devDeps
  for (const name of Object.keys(deps)) {
    if (name in devDeps) {
      report.redundant.push({
        name,
        prodVersion: deps[name],
        devVersion: devDeps[name],
        message: `Declared in both dependencies and devDependencies`,
      });
    }
  }

  // 3. Check missing peer dependencies
  const allNames = new Set([...Object.keys(allDeps), ...Object.keys(peerDeps)]);
  const knownPeerSets = {
    react: ['react-dom'],
    'react-dom': ['react'],
    vue: ['@vue/compiler-sfc'],
    '@angular/core': ['@angular/common', '@angular/platform-browser'],
    next: ['react', 'react-dom'],
    eslint: ['eslint-plugin-import'],
    typescript: ['@types/node'],
  };

  for (const [dep, peers] of Object.entries(knownPeerSets)) {
    if (dep in allDeps) {
      for (const peer of peers) {
        if (!allNames.has(peer) && !noDev) {
          report.missingPeers.push({
            for: dep,
            missing: peer,
            message: `${dep} expects peer "${peer}" but it is not installed`,
          });
        }
      }
    }
  }

  // 4. Check for potentially unused deps (simple heuristic: check if imported in source)
  // This is a basic check — for thorough analysis, use tools like depcheck
  const SRC_DIRS = ['src', 'lib', 'app', 'components', 'pages', 'utils', 'helpers'];
  const srcFiles = [];
  for (const srcDir of SRC_DIRS) {
    const p = path.join(dir, srcDir);
    if (fs.existsSync(p)) {
      walkDir(p, srcFiles, new Set(['node_modules', '.git', 'dist', 'build']));
    }
  }

  if (srcFiles.length > 0) {
    const allSource = srcFiles.map(f => {
      try { return fs.readFileSync(f, 'utf8'); } catch { return ''; }
    }).join('\n');

    for (const dep of Object.keys(deps)) {
      const importPatterns = [
        `require('${dep}')`,
        `require("${dep}")`,
        `from '${dep}'`,
        `from "${dep}"`,
        `import('${dep}')`,
        `import("${dep}")`,
        `require.resolve('${dep}')`,
        `require.resolve("${dep}")`,
      ];
      const found = importPatterns.some(p => allSource.includes(p));

      // Special case: CLI tools, config files may not be imported
      const isConfigTool = ['eslint', 'prettier', 'stylelint', 'husky', 'lint-staged', 'typescript'].some(cfg => dep.startsWith(cfg) || dep.startsWith('@' + cfg));
      const isCLI = dep === 'next' || dep === 'ts-node' || dep === 'tsx' || dep === 'nodemon';

      if (!found && !isConfigTool && !isCLI) {
        report.unused.push({
          name: dep,
          version: deps[dep],
          type: 'prod',
          reason: 'Not found in import statements in src/',
        });
      }
    }
  }

  // 5. Biggest packages (rough estimate from installed node_modules)
  const nmPath = path.join(dir, 'node_modules');
  if (fs.existsSync(nmPath)) {
    for (const name of Object.keys(allDeps).slice(0, 20)) {
      const pkgPath = path.join(nmPath, name);
      if (fs.existsSync(pkgPath)) {
        try {
          const size = getDirSize(pkgPath);
          report.biggest.push({ name, size, type: name in deps ? 'prod' : 'dev' });
        } catch {}
      }
    }
  }
}

function walkDir(dir, files, skip) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (skip.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) walkDir(full, files, skip);
      else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.ts') || entry.name.endsWith('.jsx') || entry.name.endsWith('.tsx'))) {
        files.push(full);
      }
    } catch {}
  }
}

function getDirSize(dir) {
  let size = 0;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) size += getDirSize(full);
        else if (entry.isFile()) size += fs.statSync(full).size;
      } catch {}
    }
  } catch {}
  return size;
}

function isMajorBump(current, latest) {
  const cMajor = parseInt(current.split('.')[0], 10);
  const lMajor = parseInt(latest.split('.')[0], 10);
  return !isNaN(cMajor) && !isNaN(lMajor) && lMajor > cMajor;
}

function analyzePythonDeps(reqPath, report) {
  report.depTypes.push('requirements.txt');
  try {
    const content = fs.readFileSync(reqPath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('-'));
    report.packages += lines.length;
    for (const line of lines) {
      const parts = line.split(/[=<>!~]/);
      const name = parts[0].trim();
      if (name) {
        report.dependencies.push({ name, version: parts[1]?.trim() || 'latest', type: 'py' });
      }
    }
  } catch {}
}

function analyzeCargoDeps(cargoPath, report) {
  report.depTypes.push('Cargo.toml');
  try {
    const content = fs.readFileSync(cargoPath, 'utf8');
    const lines = content.split('\n');
    let inDeps = false;
    let count = 0;
    for (const line of lines) {
      if (/^\[dependencies\]/i.test(line)) { inDeps = true; continue; }
      if (/^\[/.test(line)) { inDeps = false; continue; }
      if (inDeps && line.trim() && !line.trim().startsWith('#')) {
        const name = line.trim().split('=')[0]?.trim();
        if (name && !name.startsWith('"')) {
          count++;
          report.dependencies.push({ name, version: 'crates.io', type: 'rust' });
        }
      }
    }
    report.packages += count;
  } catch {}
}

function analyzeGoDeps(goModPath, report) {
  report.depTypes.push('go.mod');
  try {
    const content = fs.readFileSync(goModPath, 'utf8');
    const lines = content.split('\n');
    let inRequire = false;
    let count = 0;
    for (const line of lines) {
      if (/^require\s*\(/.test(line)) { inRequire = true; continue; }
      if (inRequire && /^\s*\)/.test(line)) { inRequire = false; continue; }
      if (inRequire && line.trim()) {
        const parts = line.trim().split(/\s+/);
        if (parts[0]) {
          count++;
          report.dependencies.push({ name: parts[0], version: parts[1] || 'latest', type: 'go' });
        }
      }
    }
    report.packages += count;
  } catch {}
}

function renderReport(report, format) {
  if (format === 'json') {
    return JSON.stringify(report, null, 2);
  }

  let output = `# 📦 Dependency Analysis\n\n`;

  if (report.errors.length > 0) {
    output += `## Errors\n\n`;
    for (const e of report.errors) output += `- ❌ ${e}\n`;
    output += '\n';
  }

  output += `## Summary\n\n`;
  output += `- **${report.packages}** packages (${report.depTypes.join(', ') || 'none detected'})\n\n`;

  if (report.outdated.length > 0) {
    output += `## 🔴 Outdated Packages\n\n`;
    output += `| Package | Current | Latest | Severity |\n`;
    output += `|---------|---------|--------|----------|\n`;
    for (const dep of report.outdated) {
      const icon = dep.severity === 'major' ? '🔴' : '🟡';
      output += `| ${icon} ${dep.name} | \`${dep.current}\` | \`${dep.latest}\` | ${dep.severity} |\n`;
    }
    output += '\n';
  }

  if (report.redundant.length > 0) {
    output += `## ⚠️  Redundant\n\n`;
    for (const dep of report.redundant) {
      output += `- ⚠️  **${dep.name}**: ${dep.message}\n`;
    }
    output += '\n';
  }

  if (report.unused.length > 0) {
    output += `## ℹ️  Possibly Unused\n\n`;
    output += `> These packages were not found in source imports (heuristic check)\n\n`;
    for (const dep of report.unused.slice(0, 10)) {
      output += `- ℹ️  **${dep.name}** (${dep.version}) — ${dep.reason}\n`;
    }
    if (report.unused.length > 10) {
      output += `- …and ${report.unused.length - 10} more\n`;
    }
    output += '\n';
  }

  if (report.missingPeers.length > 0) {
    output += `## ❓ Missing Peer Dependencies\n\n`;
    for (const dep of report.missingPeers) {
      output += `- ❓ **${dep.missing}** — ${dep.message}\n`;
    }
    output += '\n';
  }

  if (report.biggest.length > 0) {
    output += `## 📦 Largest Packages\n\n`;
    output += `| Package | Size | Type |\n`;
    output += `|---------|------|------|\n`;
    for (const dep of report.biggest.slice(0, 10)) {
      const sizeMB = (dep.size / (1024 * 1024)).toFixed(1);
      output += `| ${dep.name} | ${sizeMB} MB | ${dep.type} |\n`;
    }
    output += '\n';
  }

  if (report.outdated.length === 0 && report.redundant.length === 0 && report.unused.length === 0 && report.missingPeers.length === 0) {
    output += `✅ No issues found. Dependencies look clean!\n\n`;
  }

  return output;
}

exports._test = { analyzeDeps, isMajorBump, getDirSize };
