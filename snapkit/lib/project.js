/**
 * snap project — scan project structure for AI agent context
 * Migrated from projectsnap v1.0.0 with improvements
 */

const fs = require('fs');
const path = require('path');

exports.run = function (args) {
  const targetDir = args[0] || process.cwd();
  const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
  const showHelp = args.includes('--help') || args.includes('-h');

  if (showHelp) {
    console.log(`
  snap project — generate AI agent context from project structure

  Usage:
    snap project [dir]          Scan directory (default: current)
    snap project --out FILE     Write output to file
    snap project --help         Show this help

  Examples:
    snap project
    snap project ./src
    snap project --out .claude/context.md
    `);
    return;
  }

  const absDir = path.resolve(targetDir);
  if (!fs.existsSync(absDir)) {
    console.error(`❌ Directory not found: ${targetDir}`);
    process.exit(1);
  }
  if (!fs.statSync(absDir).isDirectory()) {
    console.error(`❌ Not a directory: ${targetDir}`);
    process.exit(1);
  }

  console.error('🔍 Scanning project structure...');

  const result = scanProject(absDir);

  if (result.totalFiles === 0) {
    console.error('❌ No files found. Check the directory path.');
    process.exit(1);
  }

  const context = generateContext(absDir, result);

  if (outFile) {
    const outPath = path.resolve(absDir, outFile);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, context, 'utf8');
    console.error(`✅ Context written to ${outFile} (${formatSize(Buffer.byteLength(context))})`);
  } else {
    console.log(context);
  }
};

const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'target',
  '.next', '.nuxt', '.cache', '__pycache__', '.venv', 'venv', 'env',
  '.tox', '.eggs', 'egg-info', 'vendor', 'bower_components',
  '.gradle', '.idea', '.vscode', '.DS_Store', 'coverage',
  '.nyc_output', '.pytest_cache', '.mypy_cache', '.husky/_',
]);

const IGNORE_FILES = new Set([
  '.DS_Store', 'Thumbs.db', 'package-lock.json', 'yarn.lock',
  'pnpm-lock.yaml', 'Gemfile.lock', 'composer.lock',
  '.npmrc', '.yarnrc', '.editorconfig', '.prettierrc', '.eslintrc',
]);

const EXT_MAP = {
  js: 'JavaScript', jsx: 'JSX', ts: 'TypeScript', tsx: 'TSX',
  py: 'Python', rb: 'Ruby', go: 'Go', rs: 'Rust',
  java: 'Java', kt: 'Kotlin', swift: 'Swift',
  php: 'PHP', cs: 'C#', cpp: 'C++', c: 'C', h: 'C Header',
  vue: 'Vue', svelte: 'Svelte', astro: 'Astro',
  css: 'CSS', scss: 'SCSS', less: 'Less', html: 'HTML',
  md: 'Markdown', json: 'JSON', yml: 'YAML', yaml: 'YAML',
  toml: 'TOML', xml: 'XML', sql: 'SQL', sh: 'Shell',
  zsh: 'Shell', bash: 'Shell', dockerfile: 'Dockerfile',
  tf: 'Terraform', proto: 'Protobuf',
};

const ENTRY_FILE_NAMES = [
  'package.json', 'index.js', 'index.ts', 'main.py', 'app.py',
  'main.go', 'main.rs', 'main.java', 'App.vue', 'App.tsx',
  'main.tsx', 'index.tsx', 'server.js', 'server.ts',
  'cli.js', 'cli.ts', 'cmd/main.go', 'pubspec.yaml',
  'Cargo.toml', 'go.mod', 'Gemfile', 'CMakeLists.txt',
  'Dockerfile', 'docker-compose.yml', 'Makefile',
  'Rakefile', 'setup.py', 'pyproject.toml', 'gradle.build',
  'pom.xml', 'composer.json', 'build.gradle',
];

function isIgnored(name, isDir) {
  if (IGNORE_DIRS.has(name)) return true;
  if (!isDir && IGNORE_FILES.has(name)) return true;
  return false;
}

function scanProject(dir) {
  let totalFiles = 0;
  let totalDirs = 0;
  const allFiles = [];

  function scan(dirPath, relativePath) {
    const entries = [];
    let items;
    try {
      items = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return entries;
    }

    items.sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const item of items) {
      if (isIgnored(item.name, item.isDirectory())) continue;
      const fullPath = path.join(dirPath, item.name);
      const relPath = relativePath ? `${relativePath}/${item.name}` : item.name;

      if (item.isDirectory()) {
        totalDirs++;
        const children = scan(fullPath, relPath);
        if (children.length > 0) {
          entries.push({ name: item.name, type: 'dir', children, path: relPath });
        } else {
          entries.push({ name: item.name, type: 'dir', children: [], path: relPath });
        }
      } else if (item.isFile()) {
        totalFiles++;
        let ext = path.extname(item.name).toLowerCase().replace('.', '') || 'unknown';
        try {
          const stat = fs.statSync(fullPath);
          const fileInfo = { name: item.name, ext, size: stat.size, path: relPath };
          entries.push({ name: item.name, type: 'file', ...fileInfo });
          allFiles.push(fileInfo);
        } catch {
          // skip files that can't be stat'd
        }
      }
    }
    return entries;
  }

  const tree = scan(dir, '');
  return { tree, allFiles, totalFiles, totalDirs };
}

function detectEntryPoints(files) {
  const entries = [];
  const lowerNames = new Set(files.map(f => f.name.toLowerCase()));
  for (const ef of ENTRY_FILE_NAMES) {
    if (lowerNames.has(ef)) {
      const matched = files.find(f => f.name.toLowerCase() === ef);
      if (matched) entries.push(`/${matched.path}`);
    }
  }
  return entries;
}

function detectFramework(dir, files) {
  const names = new Set(files.map(f => f.name));
  const allNames = new Set(files.map(f => f.name.toLowerCase()));

  if (allNames.has('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.next) return 'Next.js';
      if (deps.react) return 'React';
      if (deps.vue || deps['vue-router']) return 'Vue.js';
      if (deps.express) return 'Express.js';
      if (deps.nest || deps['@nestjs/core']) return 'NestJS';
      if (deps.electron) return 'Electron';
      if (deps['@angular/core']) return 'Angular';
      if (deps.svelte || deps['@sveltejs/kit']) return 'Svelte';
      if (deps.hono) return 'Hono';
      if (deps.fastify) return 'Fastify';
      if (deps.astro) return 'Astro';
      if (deps['@remix-run/react']) return 'Remix';
      if (deps.nuxt) return 'Nuxt.js';
      return 'Node.js';
    } catch { return 'Node.js'; }
  }
  if (allNames.has('pyproject.toml') || allNames.has('setup.py') || allNames.has('requirements.txt')) return 'Python';
  if (allNames.has('go.mod')) return 'Go';
  if (allNames.has('Cargo.toml')) return 'Rust';
  if (allNames.has('pubspec.yaml')) return 'Flutter/Dart';
  if (allNames.has('Gemfile')) return 'Ruby';
  if (allNames.has('composer.json')) return 'PHP';
  if (allNames.has('build.gradle') || allNames.has('pom.xml') || allNames.has('build.gradle.kts')) return 'Java/Kotlin';
  return 'Unknown';
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function summarizeExts(files) {
  const extCount = {};
  for (const f of files) {
    const lang = EXT_MAP[f.ext] || f.ext.toUpperCase();
    extCount[lang] = (extCount[lang] || 0) + 1;
  }
  return Object.entries(extCount)
    .sort((a, b) => b[1] - a[1])
    .map(([ext, count]) => `  - ${ext}: ${count} files`)
    .join('\n');
}

function treeToString(entries, prefix) {
  prefix = prefix || '';
  let result = '';
  for (let i = 0; i < entries.length; i++) {
    const item = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? '└── ' : '├── ';
    const nextPrefix = isLast ? prefix + '    ' : prefix + '│   ';
    if (item.type === 'dir') {
      result += `${prefix}${connector}📁 ${item.name}/\n`;
      result += treeToString(item.children, nextPrefix);
    } else {
      const sizeLabel = item.size ? ` (${formatSize(item.size)})` : '';
      result += `${prefix}${connector}📄 ${item.name}${sizeLabel}\n`;
    }
  }
  return result;
}

function generateContext(dir, result) {
  const { tree, allFiles, totalFiles, totalDirs } = result;
  const dirName = path.basename(dir);
  const framework = detectFramework(dir, allFiles);
  const entryPoints = detectEntryPoints(allFiles);
  const totalSize = allFiles.reduce((s, f) => s + f.size, 0);

  let context = `# Project: ${dirName}\n\n`;
  context += `## Overview\n\n`;
  context += `- **Framework/Language**: ${framework}\n`;
  context += `- **Total files**: ${totalFiles}\n`;
  context += `- **Total dirs**: ${totalDirs}\n`;
  context += `- **Total size**: ${formatSize(totalSize)}\n\n`;

  if (entryPoints.length > 0) {
    context += `## Entry Points\n\n`;
    for (const ep of entryPoints) context += `- \`${ep}\`\n`;
    context += '\n';
  }

  context += `## File Types\n\n${summarizeExts(allFiles)}\n\n`;
  context += `## Directory Structure\n\n\`\`\`\n${dirName}/\n${treeToString(tree)}\`\`\`\n\n`;

  context += `## Instructions\n\n`;
  context += `This is a ${framework} project with ${totalFiles} source files. `;
  context += `The main entry point${entryPoints.length > 1 ? 's are' : ' is'} ${entryPoints.map(e => '`' + e + '`').join(', ') || 'unknown'}. `;
  context += `Read the key files first to understand the architecture, then navigate to specific modules as needed.\n`;

  return context;
}

exports._test = { scanProject, generateContext, detectFramework, detectEntryPoints };
