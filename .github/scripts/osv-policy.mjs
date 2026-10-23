import assert from 'node:assert/strict';

export const TARGET = 'x86_64-pc-windows-msvc';
export const SCANNER = Object.freeze({
  version: '2.7.0',
  sha256: '9964ed64ec9a387391eb4cc006ad5c531154821aef29b793e02c448de4686438',
  url: 'https://github.com/google/osv-scanner/releases/download/v2.7.0/osv-scanner_windows_amd64.exe',
});
const REGISTRY = 'registry+https://github.com/rust-lang/crates.io-index';
export const key = p => `${p.name}@${p.version}`;
const sameSet = (a, b, message) => assert.deepEqual([...a].sort(), [...b].sort(), message);
const array = (value, label) => { assert.ok(Array.isArray(value), `${label}: expected array`); return value; };

// Intentionally supports Cargo-generated lockfile v3/v4, not arbitrary TOML.
// Unsupported sources/layouts fail closed instead of being scanned as crates.io.
export function inventory(npm, cargoText) {
  assert.equal(npm.lockfileVersion, 3, 'Only npm lockfile v3 is supported');
  assert.ok(npm.packages?.[''], 'npm root package missing');
  const npmPackages = Object.entries(npm.packages).filter(([p]) => p).map(([p, v]) => {
    assert.ok(p.includes('node_modules/') && !v.link, `Unsupported npm entry: ${p}`);
    assert.match(v.resolved ?? '', /^https:\/\/registry\.npmjs\.org\//, `Unsupported npm source: ${p}`);
    assert.ok(typeof v.version === 'string' && v.version, `Missing npm version: ${p}`);
    return { name: v.name ?? p.split('node_modules/').at(-1), version: v.version };
  });
  assert.match(cargoText, /^version = [34]\s*$/m, 'Unsupported Cargo lockfile format');
  const cargoPackages = cargoText.split(/^\[\[package\]\]\s*$/m).slice(1).map(block => {
    const scalar = name => {
      const matches = [...block.matchAll(new RegExp(`^${name} = "([^"\\r\\n]+)"$`, 'gm'))];
      assert.ok(matches.length <= 1, `Duplicate Cargo ${name}`);
      return matches[0]?.[1];
    };
    const p = { name: scalar('name'), version: scalar('version'), source: scalar('source') ?? null };
    assert.ok(p.name && p.version, 'Incomplete Cargo package');
    assert.ok(p.source === null || p.source === REGISTRY, `Unsupported Cargo source: ${key(p)}`);
    return p;
  });
  assert.ok(npmPackages.length && cargoPackages.length > 1, 'Empty dependency inventory');
  assert.equal(cargoPackages.filter(p => p.source === null).length, 1, 'Only one local Cargo root is supported');
  sameSet(new Set(cargoPackages.map(key)), cargoPackages.map(key), 'Duplicate Cargo identity');
  return { npm: npmPackages, cargo: cargoPackages };
}

export function windowsGraph(metadata, treeText, locked) {
  assert.equal(metadata.version, 1, 'Unsupported Cargo metadata version');
  const packages = array(metadata.packages, 'metadata packages');
  const nodes = array(metadata.resolve?.nodes, 'metadata resolve nodes');
  const rootId = metadata.resolve.root;
  assert.deepEqual(metadata.workspace_members, [rootId], 'Only a single Cargo package is supported');
  const byId = new Map(packages.map(p => [p.id, p]));
  const byKey = new Map(packages.map(p => [key(p), p]));
  assert.equal(byKey.size, packages.length, 'Ambiguous Cargo package identity');
  const lockedKeys = new Set(locked.map(key));
  for (const p of packages) {
    assert.ok(lockedKeys.has(key(p)), `Metadata package absent from lockfile: ${key(p)}`);
    assert.ok(p.id === rootId ? p.source === null : p.source === REGISTRY, `Unsupported resolved source: ${key(p)}`);
  }
  const byNode = new Map(nodes.map(n => [n.id, n]));
  assert.ok(byId.has(rootId) && byNode.has(rootId), 'Metadata root missing');
  for (const n of nodes) {
    assert.ok(byId.has(n.id), 'Unknown metadata node');
    for (const d of array(n.deps, 'metadata deps')) {
      assert.ok(byNode.has(d.pkg), 'Incomplete metadata dependency graph');
      assert.ok(array(d.dep_kinds, 'dependency kinds').length, 'Missing dependency kind');
    }
  }
  const root = key(byId.get(rootId)), selected = new Set(), edges = new Set(), stack = [];
  let roots = 0;
  for (const line of treeText.trimEnd().split(/\r?\n/)) {
    const m = /^(\d+)([A-Za-z0-9_-]+) v([^\s|]+)(?: \([^|]*\))?\|([^|]*)$/.exec(line);
    assert.ok(m && !line.includes('(*)'), `Invalid/unexpanded Cargo tree line: ${line.slice(0,160)}`);
    const depth = Number(m[1]), id = `${m[2]}@${m[3]}`;
    assert.ok(byKey.has(id) && byNode.has(byKey.get(id).id), `Tree package absent from metadata: ${id}`);
    if (depth === 0) { roots++; assert.equal(id, root, 'Unexpected tree root'); }
    else {
      assert.ok(stack[depth - 1], 'Cargo tree depth gap');
      const parent = byKey.get(stack[depth - 1]), child = byKey.get(id);
      assert.ok(byNode.get(parent.id).deps.some(d => d.pkg === child.id && d.dep_kinds.some(k => k.kind === null || k.kind === 'build')), 'Tree edge absent from normal/build metadata');
      edges.add(`${stack[depth - 1]} -> ${id}`);
    }
    selected.add(id); stack[depth] = id; stack.length = depth + 1;
  }
  assert.equal(roots, 1, 'Expected exactly one complete tree');
  assert.ok(selected.size > 1, 'Empty selected dependency graph');
  // Metadata can include inactive optional dependencies. Require every selected
  // parent's non-optional normal/build edge, while retaining the metadata extras.
  for (const id of selected) {
    const p = byKey.get(id);
    for (const d of byNode.get(p.id).deps) {
      const child = byId.get(d.pkg);
      const required = d.dep_kinds.some(k => (k.kind === null || k.kind === 'build') &&
        p.dependencies.some(dep => !dep.optional && dep.name === child.name && dep.kind === k.kind && dep.target === k.target));
      if (required) assert.ok(edges.has(`${id} -> ${key(child)}`), `Incomplete tree: required edge ${id} -> ${key(child)}`);
    }
  }
  return { root, packages: [...selected].sort(), edges: [...edges].sort(), metadataPackages: nodes.map(n => key(byId.get(n.id))).sort() };
}

export function classify(scan, scannerExit, locked, graphs) {
  assert.ok(scannerExit === 0 || scannerExit === 1, `OSV scan failed (exit ${scannerExit})`);
  assert.equal(graphs.length, 2, 'Both default and custom-protocol Windows graphs are required');
  assert.ok(graphs.every(g => g.packages.length > 1), 'Incomplete Windows graph');
  const windows = new Set(graphs.flatMap(g => g.packages));
  const metadata = new Set(graphs.flatMap(g => g.metadataPackages));
  const expected = { npm: new Set(locked.npm.map(key)), 'crates.io': new Set(locked.cargo.map(key)) };
  const seen = { npm: new Set(), 'crates.io': new Set() }, findings = new Map();
  const results = array(scan.results, 'OSV results');
  assert.equal(results.length, 2, 'Expected both full lockfile results');
  const sources = new Set();
  let records = 0;
  for (const result of results) {
    const source = result.source?.path?.replaceAll('\\', '/');
    const ecosystem = source?.endsWith('/src-tauri/Cargo.lock') ? 'crates.io' : source?.endsWith('/package-lock.json') ? 'npm' : null;
    assert.ok(ecosystem && result.source.type === 'lockfile', 'Unexpected OSV source');
    assert.ok(!sources.has(ecosystem), 'Duplicate OSV source'); sources.add(ecosystem);
    for (const row of array(result.packages, 'OSV packages')) {
      const p = row.package;
      assert.equal(p?.ecosystem, ecosystem, 'OSV ecosystem mismatch');
      assert.ok(expected[ecosystem].has(key(p)), `Unexpected OSV package: ${key(p)}`);
      seen[ecosystem].add(key(p));
      const advisories = row.vulnerabilities ?? [], groups = row.groups ?? [];
      array(advisories, 'advisories'); array(groups, 'groups'); records += advisories.length;
      const covered = [];
      for (const group of groups) {
        assert.ok(array(group.ids, 'advisory IDs').length, 'Empty advisory group');
        const members = group.ids.map(id => {
          const matches = advisories.filter(v => v.id === id);
          assert.equal(matches.length, 1, 'Advisory group mismatch'); covered.push(id); return matches[0];
        });
        const infos = members.map(v => {
          const affected = array(v.affected, 'affected packages').filter(a => a.package?.name === p.name && a.package.ecosystem === ecosystem);
          assert.ok(affected.length, 'Advisory missing affected package');
          return affected.map(a => a.database_specific?.informational);
        }).flat();
        const category = infos.every(i => i === 'unmaintained') ? 'maintenance' : infos.includes('unsound') ? 'soundness' : 'vulnerability';
        const inScope = ecosystem === 'npm' || windows.has(key(p));
        const ids = [...group.ids].sort();
        findings.set(`${ecosystem}:${key(p)}:${ids.join(',')}`, {
          ecosystem, name: p.name, version: p.version, ids, category, inScope,
          scope: ecosystem === 'npm' ? 'npm (all groups/platforms)' : inScope ? 'selected Windows normal/build/proc-macro' : metadata.has(key(p)) ? 'Windows metadata only: inactive/dev dependencies' : 'outside Windows metadata for both profiles',
          summaries: [...new Set(members.map(v => v.summary ?? v.id))],
          fixed: [...new Set(members.flatMap(v => v.affected.filter(a => a.package?.name === p.name && a.package.ecosystem === ecosystem).flatMap(a => (a.ranges ?? []).flatMap(r => (r.events ?? []).filter(e => e.fixed).map(e => e.fixed)))))],
        });
      }
      sameSet(covered, advisories.map(v => v.id), 'Ungrouped or duplicate advisory');
    }
  }
  for (const ecosystem of Object.keys(expected)) sameSet(seen[ecosystem], expected[ecosystem], `Incomplete OSV coverage: ${ecosystem}`);
  assert.equal(scannerExit, records ? 1 : 0, 'OSV result/exit code mismatch');
  const all = [...findings.values()];
  return {
    target: TARGET, profiles: ['default', 'tauri/custom-protocol'],
    coverage: { npm: seen.npm.size, cargo: seen['crates.io'].size, windowsIncludingRoot: windows.size },
    blocking: all.filter(f => f.inScope && f.category !== 'maintenance'),
    outsideTarget: all.filter(f => !f.inScope),
    maintenance: all.filter(f => f.category === 'maintenance'),
    findings: all,
  };
}

export function summary(result) {
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('|', '&#124;').replace(/[\r\n]/g, ' ');
  const section = (title, rows) => `### ${title}\n\n` + (rows.length ? '| Package | Advisory | Kind | Scope | Fixed versions |\n|---|---|---|---|---|\n' + rows.map(f => `| ${escape(f.name)} ${escape(f.version)} | ${escape(f.ids.join(', '))} | ${f.category} | ${escape(f.scope)} | ${escape(f.fixed.join(', ') || 'none published')} |`).join('\n') : 'None.') + '\n';
  return `## OSV dependency check: ${result.blocking.length ? 'BLOCKED' : 'PASS'}\n\nTarget: ${TARGET}. Default + custom-protocol normal/build trees include proc-macros.\n\nCoverage: ${result.coverage.npm} npm, ${result.coverage.cargo} Cargo lockfile package versions; ${result.coverage.windowsIncludingRoot} selected Windows nodes including app.\n\nDependency presence is not runtime reachability. Full cross-platform JSON and command logs are retained as artifacts.\n\n` +
    section('Blocking vulnerabilities / soundness', result.blocking) + section('Outside selected Windows profiles (non-blocking)', result.outsideTarget) + section('Maintenance-only notices (non-blocking; may overlap above)', result.maintenance);
}
