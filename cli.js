#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const targetDir = args[0] || process.cwd();
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const showHelp = args.includes('--help') || args.includes('-h');

const IGNORE_DIRS = new Set([
  'node_modules','.git','.svn','.hg','dist','build','target',
  '.next','.nuxt','.cache','__pycache__','.venv','venv','env',
  '.tox','.eggs','egg-info','vendor','bower_components',
  '.gradle','.idea','.vscode','.DS_Store','coverage',
  '.nyc_output','.pytest_cache','.mypy_cache','.husky/_'
]);

const IGNORE_FILES = new Set([
  '.DS_Store','Thumbs.db','package-lock.json','yarn.lock',
  'pnpm-lock.yaml','Gemfile.lock','composer.lock',
  '.npmrc','.yarnrc','.editorconfig','.prettierrc','.eslintrc'
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

let totalFiles = 0;
let totalDirs = 0;
let fileTree = {};
let allFiles = [];

function isIgnored(name) {
  if (IGNORE_DIRS.has(name)) return true;
  if (IGNORE_FILES.has(name)) return true;
  if (name.startsWith('.')) return false; // don't ignore all dotfiles
  return false;
}

function scanDir(dir, relativePath = '') {
  const entries = [];
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const item of items) {
      if (isIgnored(item.name)) continue;
      const fullPath = path.join(dir, item.name);
      const relPath = relativePath ? `${relativePath}/${item.name}` : item.name;
      if (item.isDirectory()) {
        totalDirs++;
        const sub = scanDir(fullPath, relPath);
        if (sub.length > 0) entries.push({ name: item.name, type: 'dir', children: sub, path: relPath });
      } else if (item.isFile()) {
        totalFiles++;
        const ext = path.extname(item.name).toLowerCase().replace('.', '') || 'unknown';
        const size = fs.statSync(fullPath).size;
        const fileInfo = { name: item.name, ext, size, path: relPath };
        entries.push({ name: item.name, type: 'file', ...fileInfo });
        allFiles.push(fileInfo);
      }
    }
  } catch (e) {}
  return entries;
}

function detectEntryPoints(files) {
  const entries = [];
  const names = files.map(f => f.name.toLowerCase());
  const entryFiles = [
    'package.json', 'index.js', 'index.ts', 'main.py', 'app.py',
    'main.go', 'main.rs', 'main.java', 'App.vue', 'App.tsx',
    'main.tsx', 'index.tsx', 'server.js', 'server.ts',
    'cli.js', 'cli.ts', 'cmd/main.go', 'pubspec.yaml',
    'Cargo.toml', 'go.mod', 'Gemfile', 'CMakeLists.txt',
    'Dockerfile', 'docker-compose.yml', 'Makefile',
    'Rakefile', 'setup.py', 'pyproject.toml', 'gradle.build',
    'pom.xml', 'composer.json', 'build.gradle'
  ];
  for (const ef of entryFiles) {
    if (names.includes(ef)) {
      const matched = files.find(f => f.name.toLowerCase() === ef);
      if (matched) entries.push(`/${matched.path}`);
    }
  }
  return entries;
}

function detectFramework(files) {
  const names = new Set(files.map(f => f.name));
  const paths = new Set(files.map(f => f.path));

  if (names.has('package.json')) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps.next) return 'Next.js';
      if (deps.react) return 'React';
      if (deps.vue) return 'Vue.js';
      if (deps.express) return 'Express.js';
      if (deps.nest) return 'NestJS';
      if (deps.electron) return 'Electron';
      if (deps['@angular/core']) return 'Angular';
      if (deps.svelte || deps['@sveltejs/kit']) return 'Svelte';
      return 'Node.js';
    } catch (e) { return 'Node.js'; }
  }
  if (names.has('pyproject.toml') || names.has('setup.py') || names.has('requirements.txt')) {
    return 'Python';
  }
  if (names.has('go.mod')) return 'Go';
  if (names.has('Cargo.toml')) return 'Rust';
  if (names.has('pubspec.yaml')) return 'Flutter/Dart';
  if (names.has('Gemfile')) return 'Ruby';
  if (names.has('composer.json')) return 'PHP';
  if (names.has('build.gradle') || names.has('pom.xml')) return 'Java';
  if (paths.some(p => p.endsWith('.vue'))) return 'Vue.js';
  if (paths.some(p => p.endsWith('.tsx') || p.endsWith('.jsx'))) return 'React';
  return 'Unknown';
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024*1024) return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/(1024*1024)).toFixed(1)} MB`;
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

function treeToString(entries, prefix = '') {
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
      const size = item.size ? ` (${formatSize(item.size)})` : '';
      result += `${prefix}${connector}📄 ${item.name}${size}\n`;
    }
  }
  return result;
}

function generateContext(rootDir, tree, files, entries) {
  const dirName = path.basename(rootDir);
  const framework = detectFramework(files);
  const entryPoints = detectEntryPoints(files);
  const totalSize = files.reduce((s, f) => s + f.size, 0);

  let context = `# Project: ${dirName}\n\n`;
  context += `## Overview\n\n`;
  context += `- **Framework/Language**: ${framework}\n`;
  context += `- **Total files**: ${totalFiles}\n`;
  context += `- **Total dirs**: ${totalDirs}\n`;
  context += `- **Total size**: ${formatSize(totalSize)}\n\n`;

  if (entryPoints.length > 0) {
    context += `## Entry Points\n\n`;
    for (const ep of entryPoints) {
      context += `- \`${ep}\`\n`;
    }
    context += '\n';
  }

  context += `## File Types\n\n${summarizeExts(files)}\n\n`;
  context += `## Directory Structure\n\n\`\`\`\n${dirName}/\n${treeToString(tree)}\`\`\`\n\n`;

  context += `## Instructions\n\n`;
  context += `This is a ${framework} project with ${totalFiles} source files. `;
  context += `The main entry point${entryPoints.length > 1 ? 's are' : ' is'} ${entryPoints.map(e => '`' + e + '`').join(', ') || 'unknown'}. `;
  context += `Read the key files first to understand the architecture, then navigate to specific modules as needed.\n`;

  return context;
}

if (showHelp) {
  console.log(`
  Project Snap — AI project context generator

  Usage:
    project-snap [dir]          Scan directory (default: current)
    project-snap --out FILE     Write output to file
    project-snap --help         Show this help

  Examples:
    project-snap
    project-snap ./src
    project-snap --out .claude/context.md
  `);
  process.exit(0);
}

console.error('🔍 Scanning...');

const tree = scanDir(targetDir);
if (totalFiles === 0) {
  console.error('❌ No files found. Check the directory path.');
  process.exit(1);
}

const context = generateContext(targetDir, tree, allFiles, detectEntryPoints(allFiles));

if (outFile) {
  const outDir = path.dirname(path.resolve(targetDir, outFile));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.resolve(targetDir, outFile), context, 'utf8');
  console.error(`✅ Context written to ${outFile} (${formatSize(Buffer.byteLength(context))})`);
} else {
  console.log(context);
}
