/**
 * snap api — discover API endpoints in project source
 *
 * Scans project files for route definitions (Express, Fastify, Next.js,
 * Hono, plain HTTP) and outputs a structured endpoint list.
 *
 * Limitations:
 * - Only scans statically defined routes (not dynamically constructed paths)
 * - Supports common frameworks: Express, Fastify, Hono, Next.js App Router,
 *   plain http.createServer, and generic route patterns
 */

const fs = require('fs');
const path = require('path');

exports.run = function (args) {
  const targetDir = args[0] || process.cwd();
  const showHelp = args.includes('--help') || args.includes('-h');
  const format = args.includes('--json') ? 'json' : 'table';
  const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;

  if (showHelp) {
    console.log(`
  snap api — discover API endpoints in project source

  Usage:
    snap api [dir]              Scan directory (default: current)
    snap api --json             Output as JSON
    snap api --out FILE         Write output to file
    snap api --help             Show this help

  Examples:
    snap api
    snap api ./src --json
    snap api --out endpoints.md
    `);
    return;
  }

  const absDir = path.resolve(targetDir);
  if (!fs.existsSync(absDir)) {
    console.error(`❌ Directory not found: ${targetDir}`);
    process.exit(1);
  }

  console.error('🔍 Scanning for API endpoints...');

  const endpoints = scanEndpoints(absDir);

  if (endpoints.length === 0) {
    console.log('No API endpoints detected in this project.');
    return;
  }

  if (format === 'json') {
    const output = JSON.stringify(endpoints, null, 2);
    if (outFile) {
      fs.writeFileSync(path.resolve(outFile), output, 'utf8');
      console.error(`✅ Endpoints written to ${outFile} (${endpoints.length} routes)`);
    } else {
      console.log(output);
    }
  } else {
    const output = renderTable(endpoints);
    if (outFile) {
      fs.writeFileSync(path.resolve(outFile), output, 'utf8');
      console.error(`✅ Endpoints written to ${outFile} (${endpoints.length} routes)`);
    } else {
      console.log(output);
    }
  }

  console.error(`\n📊 Found ${endpoints.length} route(s) in ${endpoints.reduce((s, e) => s.add(e.file), new Set()).size} file(s)`);
};

// HTTP methods we look for
const HTTP_METHODS = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'all', 'use'];

// Route detection regex patterns (ordered by specificity)
const ROUTE_PATTERNS = [
  // Express/Fastify style: app.get('/path', handler)
  { regex: /\b(?:app|router|route|server|api)\s*\.\s*(get|post|put|delete|patch|head|options|all)\s*\(\s*['"]([^'"]+)['"]\s*,/g, method: 1, path: 2, framework: 'Express/Fastify' },
  // Express/Fastify: app.use('/path', router)
  { regex: /\b(?:app|router)\s*\.\s*use\s*\(\s*['"]([^'"]+)['"]\s*,/g, method: null, path: 1, framework: 'Express/Fastify' },
  // Hono: app.get('/path', handler) or app.on('GET', '/path', handler)
  { regex: /\b(?:app|router)\s*\.\s*(get|post|put|delete|patch|head|options|all)\s*\(\s*['"]([^'"]+)['"]\s*,/g, method: 1, path: 2, framework: 'Hono' },
  // Hono: app.on('GET', '/path', handler)
  { regex: /\b(?:app|router)\s*\.\s*on\s*\(\s*['"]([A-Z]+)['"]\s*,\s*['"]([^'"]+)['"]\s*,/g, method: 1, path: 2, framework: 'Hono' },
  // Next.js App Router: export async function GET/POST in route.ts
  { regex: /export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s*\(/g, method: 1, framework: 'Next.js App Router', isExport: true },
  // Next.js API routes: pages/api/ route patterns
  { regex: /export\s+(?:default\s+)?(?:async\s+)?function\s+(?:handler|handle)\s*\(/gi, method: null, framework: 'Next.js Pages Router', isExport: true },
  // HTTP createServer: server.on('request', ...) or .on('GET', ...
  { regex: /\b(?:server|http)\s*\.\s*on\s*\(\s*['"](request|connection|[A-Z]+)['"]\s*,/g, method: 1, framework: 'Node HTTP' },
  // Generic: .route('/path') pattern
  { regex: /\b\.\s*route\s*\(\s*['"]([^'"]+)['"]\s*\)/g, method: null, path: 1, framework: 'Generic' },
  // Fastify: fastify.get('/path', handler)
  { regex: /\bfastify\s*\.\s*(get|post|put|delete|patch|head|options)\s*\(\s*['"]([^'"]+)['"]\s*,/g, method: 1, path: 2, framework: 'Fastify' },
  // tRPC: t.router({ ... })
  { regex: /\b(?:t|trpc)\s*\.\s*router\s*\(\s*\{/g, method: null, framework: 'tRPC', isRouter: true },
  // GraphQL: gql`...` or buildSchema(`
  { regex: /(?:gql|GraphQL|buildSchema)\s*(?:`|\(\s*`)/g, method: null, framework: 'GraphQL' },
  // Routes file patterns: routes/path patterns
  { regex: /router\s*(?:\.|:)\s*(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]\s*,/g, method: 1, path: 2, framework: 'Generic Router' },
  // Koa: router.get('/path', handler)
  { regex: /\brouter\s*\.\s*(get|post|put|delete|patch|head|options)\s*\(\s*['"]([^'"]+)['"]\s*,/g, method: 1, path: 2, framework: 'Koa/Router' },
  // Koa: app.use(router.routes())
  { regex: /\brouter\s*\.\s*routes\s*\(\s*\)/g, method: null, framework: 'Koa' },
  // NestJS: @Get() @Post() etc decorators
  { regex: /@(Get|Post|Put|Delete|Patch|Head|Options)\(\s*['"]([^'"]+)['"]\s*\)/g, method: 1, path: 2, framework: 'NestJS' },
  // NestJS decorator without path
  { regex: /@(Get|Post|Put|Delete|Patch|Head|Options)\(\s*\)/g, method: 1, path: '/ (implicit)', framework: 'NestJS' },
  // Controller decorator
  { regex: /@Controller\(\s*['"]([^'"]+)['"]\s*\)/g, method: null, path: 1, framework: 'NestJS Controller' },
];

function scanEndpoints(dir) {
  const endpoints = [];
  const controllers = []; // NestJS controller prefixes
  const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', 'dist', 'build', 'target', '.next', '.nuxt', '__pycache__', '.venv', 'venv', '.cache', 'coverage', 'vendor', '.gradle', '.idea']);
  const EXT_INTEREST = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts']);

  function walk(d) {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      const full = path.join(d, entry.name);
      try {
        if (entry.isDirectory()) {
          // Check for Next.js App Router route files
          if (entry.name === 'api' || entry.name.endsWith('api')) {
            walkApiDirectory(full, endpoints);
          }
          walk(full);
        } else if (entry.isFile() && EXT_INTEREST.has(path.extname(entry.name).toLowerCase())) {
          scanFile(full, endpoints, controllers, dir);
        }
      } catch {}
    }
  }

  walk(dir);
  return endpoints;
}

function walkApiDirectory(apiDir, endpoints) {
  // For Next.js App Router, scan for route.ts/route.js files
  let entries;
  try { entries = fs.readdirSync(apiDir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(apiDir, entry.name);
    if (entry.isDirectory()) {
      // Next.js [param] dynamic routes
      const prefix = entry.name;
      const routeFiles = ['route.ts', 'route.js', 'route.mjs', 'route.mts'];
      // Check for direct route.ts
      for (const rf of routeFiles) {
        const rp = path.join(full, rf);
        if (fs.existsSync(rp)) {
          const relativePath = path.relative(process.cwd(), rp);
          endpoints.push({
            method: 'GET/POST/PUT/DELETE/PATCH',
            path: '/' + path.relative(path.dirname(apiDir), full).replace(/\[([^\]]+)\]/g, ':$1').toLowerCase(),
            file: relativePath,
            line: 1,
            framework: 'Next.js App Router',
          });
        }
      }
      walkApiDirectory(full, endpoints);
    }
  }
}

function scanFile(filePath, endpoints, controllers, rootDir) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch { return; }

  const relPath = path.relative(rootDir, filePath);
  const lines = content.split('\n');

  // Look for NestJS @Controller decorator
  const controllerMatch = lines.findIndex(l => /@Controller\(\s*['"]([^'"]+)['"]\s*\)/.test(l));
  let controllerPrefix = '';
  if (controllerMatch >= 0) {
    const m = lines[controllerMatch].match(/@Controller\(\s*['"]([^'"]+)['"]\s*\)/);
    if (m) controllerPrefix = m[1];
  }

  for (const pattern of ROUTE_PATTERNS) {
    // Reset the global regex
    pattern.regex.lastIndex = 0;
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      const lineNum = findLineNumber(lines, match.index);
      let method = null;
      let routePath = null;
      let framework = pattern.framework;

      if (pattern.method && match[pattern.method]) {
        method = match[pattern.method].toUpperCase();
      }
      if (pattern.path && match[pattern.path]) {
        routePath = match[pattern.path];
      }

      // For Next.js App Router exports, derive path from file location
      if (pattern.isExport && method) {
        const apiIndex = relPath.indexOf('/api/');
        if (apiIndex >= 0) {
          routePath = '/' + relPath.slice(apiIndex + 5).replace(/\.(ts|js|tsx|jsx|mjs|cjs|mts|cts)$/, '');
          routePath = routePath.replace(/\/route$/, '');
          routePath = routePath.replace(/\[([^\]]+)\]/g, ':$1');
          // If file is index, path ends at directory
          if (routePath.endsWith('/index')) routePath = routePath.slice(0, -6);
          if (!routePath.startsWith('/')) routePath = '/' + routePath;
        } else {
          routePath = '/';
        }
        framework = 'Next.js App Router';
      }

      // Skip if we have no useful info
      if (!method && !routePath) continue;

      // Handle controller prefix for NestJS
      let fullPath = routePath || '';
      if (controllerPrefix && method && routePath) {
        fullPath = controllerPrefix + routePath;
      }

      // Check if this endpoint already exists (dedup)
      const exists = endpoints.some(e =>
        e.method === (method || '*') &&
        e.path === (fullPath || routePath || '*') &&
        e.file === relPath
      );

      if (!exists) {
        endpoints.push({
          method: method || '*',
          path: fullPath || routePath || '*',
          file: relPath,
          line: lineNum,
          framework,
        });
      }
    }
  }
}

function findLineNumber(lines, index) {
  let charCount = 0;
  for (let i = 0; i < lines.length; i++) {
    charCount += lines[i].length + 1; // +1 for \n
    if (charCount > index) return i + 1;
  }
  return lines.length;
}

function renderTable(endpoints) {
  // Group by framework
  const byFramework = {};
  for (const ep of endpoints) {
    if (!byFramework[ep.framework]) byFramework[ep.framework] = [];
    byFramework[ep.framework].push(ep);
  }

  let output = `# API Endpoints\n\n`;
  output += `Found **${endpoints.length}** route(s)\n\n`;

  for (const [fw, eps] of Object.entries(byFramework)) {
    output += `## ${fw}\n\n`;
    output += `| Method | Path | File | Line |\n`;
    output += `|--------|------|------|------|\n`;
    for (const ep of eps) {
      const methodStr = ep.method === '*' ? '**ANY**' : `\`${ep.method}\``;
      output += `| ${methodStr} | \`${ep.path}\` | \`${ep.file}\` | ${ep.line} |\n`;
    }
    output += '\n';
  }

  return output;
}

exports._test = { scanEndpoints, ROUTE_PATTERNS, findLineNumber };
