import test from 'node:test';
import assert from 'node:assert/strict';
import { inventory, windowsGraph, classify, summary, key } from './osv-policy.mjs';

const REG = 'registry+https://github.com/rust-lang/crates.io-index';
function fixture() {
  const names = ['app', 'runtime', 'builder', 'macro', 'maintenance', 'release-only', 'linux-only'];
  const cargo = names.map(name => ({ name, version: '1.0.0', source: name === 'app' ? null : REG }));
  const packages = cargo.filter(p => p.name !== 'linux-only').map(p => ({
    ...p, id: p.name, dependencies: [],
  }));
  packages[0].dependencies = ['runtime', 'builder', 'maintenance', 'release-only'].map(name => ({
    name, kind: name === 'builder' ? 'build' : null, target: null, optional: name === 'release-only',
  }));
  packages.find(p => p.name === 'builder').dependencies = [{ name: 'macro', kind: null, target: null, optional: false }];
  const nodes = packages.map(p => ({
    id: p.id, deps: p.dependencies.map(d => ({ pkg: d.name, name: d.name, dep_kinds: [{ kind: d.kind, target: d.target }] })),
  }));
  const metadata = { version: 1, packages, workspace_members: ['app'], resolve: { root: 'app', nodes } };
  const tree = '0app v1.0.0 (C:\\input)|\n1runtime v1.0.0|default\n1builder v1.0.0|\n2macro v1.0.0 (proc-macro)|\n1maintenance v1.0.0|\n';
  const locked = { npm: [{ name: 'npm-package', version: '1.0.0' }], cargo };
  const scan = { results: [
    { source: { path: 'C:/input/package-lock.json', type: 'lockfile' }, packages: locked.npm.map(p => ({ package: { ...p, ecosystem: 'npm' }, dependency_groups: ['dev', 'optional'] })) },
    { source: { path: 'C:/input/src-tauri/Cargo.lock', type: 'lockfile' }, packages: cargo.map(p => ({ package: { name: p.name, version: p.version, ecosystem: 'crates.io' } })) },
  ] };
  return { metadata, tree, locked, scan };
}
function finding(f, name, info, id = 'TEST-' + name, alias = null) {
  const row = f.scan.results.flatMap(r => r.packages).find(r => r.package.name === name);
  const advisory = { id, summary: id, affected: [{ package: { name, ecosystem: row.package.ecosystem }, database_specific: info ? { informational: info } : {}, ranges: [{ events: [{ introduced: '0' }, { fixed: '1.0.1' }] }] }] };
  row.vulnerabilities ??= []; row.groups ??= [];
  if (alias) { row.vulnerabilities.push(advisory); row.groups[0].ids.push(id); }
  else { row.vulnerabilities.push(advisory); row.groups.push({ ids: [id] }); }
}
function evaluate(f, exit, customTree = f.tree) {
  return classify(f.scan, exit, f.locked, [
    windowsGraph(f.metadata, f.tree, f.locked.cargo),
    windowsGraph(f.metadata, customTree, f.locked.cargo),
  ]);
}

test('clean complete lockfiles pass; build and proc-macro nodes are retained', () => {
  const f = fixture(), result = evaluate(f, 0);
  assert.equal(result.blocking.length, 0);
  assert.equal(result.coverage.windowsIncludingRoot, 5);
  const graph = windowsGraph(f.metadata, f.tree, f.locked.cargo);
  assert.ok(graph.packages.includes('macro@1.0.0'));
  assert.ok(graph.edges.includes('builder@1.0.0 -> macro@1.0.0'));
});
for (const name of ['npm-package', 'runtime', 'builder', 'macro']) {
  test(name + ' vulnerability blocks, including npm dev/optional groups', () => {
    const f = fixture(); finding(f, name);
    assert.equal(evaluate(f, 1).blocking[0].name, name);
  });
}
test('soundness aliases count once and block even with a non-informational GHSA alias', () => {
  const f = fixture(); finding(f, 'runtime', 'unsound', 'RUSTSEC-test'); finding(f, 'runtime', null, 'GHSA-test', true);
  const r = evaluate(f, 1);
  assert.equal(r.blocking.length, 1); assert.equal(r.blocking[0].category, 'soundness');
  assert.equal(r.blocking[0].ids.length, 2);
});
test('other-platform vulnerability and maintenance remain visible without blocking', () => {
  const f = fixture(); finding(f, 'linux-only', 'unsound'); finding(f, 'maintenance', 'unmaintained');
  const r = evaluate(f, 1);
  assert.equal(r.blocking.length, 0); assert.equal(r.outsideTarget.length, 1); assert.equal(r.maintenance.length, 1);
  assert.match(summary(r), /TEST-linux-only/); assert.match(summary(r), /TEST-maintenance/);
});
test('custom-protocol profile adds gate coverage; inactive metadata is not automatically selected', () => {
  const f = fixture(); finding(f, 'release-only');
  assert.equal(evaluate(f, 1).blocking.length, 0);
  const r = evaluate(f, 1, f.tree + '1release-only v1.0.0|\n');
  assert.equal(r.blocking.length, 1);
});
test('unknown informational category and mixed maintenance/security are not suppressed', () => {
  for (const kind of ['notice', undefined]) {
    const f = fixture(); finding(f, 'runtime', kind);
    assert.equal(evaluate(f, 1).blocking.length, 1);
  }
  const f = fixture(); finding(f, 'runtime', 'unmaintained'); finding(f, 'runtime', null, 'ALIAS', true);
  assert.equal(evaluate(f, 1).blocking.length, 1);
});
test('different versions of a package are not conflated', () => {
  const f = fixture();
  f.locked.cargo.push({ name: 'runtime', version: '2.0.0', source: REG });
  f.scan.results[1].packages.push({ package: { name: 'runtime', version: '2.0.0', ecosystem: 'crates.io' } });
  const row = f.scan.results[1].packages.find(p => p.package.name === 'runtime');
  row.package.version = '2.0.0'; f.scan.results[1].packages.at(-1).package.version = '1.0.0';
  finding(f, 'runtime');
  assert.equal(evaluate(f, 1).blocking.length, 0);
});
for (const exit of [127, 128, 2, null]) test('scanner error exit ' + exit + ' cannot pass', () => {
  assert.throws(() => evaluate(fixture(), exit), /OSV scan failed/);
});
test('exit/result mismatches fail', () => {
  assert.throws(() => evaluate(fixture(), 1), /exit code mismatch/);
  const f = fixture(); finding(f, 'runtime');
  assert.throws(() => evaluate(f, 0), /exit code mismatch/);
});
test('missing source, package, unsupported ecosystem or ungrouped advisory fails closed', () => {
  const mutations = [
    f => f.scan.results.pop(),
    f => f.scan.results[1].packages.pop(),
    f => { f.scan.results[0].packages[0].package.ecosystem = 'unknown'; },
    f => { finding(f, 'runtime'); f.scan.results[1].packages.find(p => p.package.name === 'runtime').groups = []; },
    f => { f.scan.results[0].source.path = 'C:/input/other-lock.json'; },
  ];
  for (const mutate of mutations) { const f = fixture(); mutate(f); assert.throws(() => evaluate(f, 0)); }
});
test('missing profile fails closed', () => {
  const f = fixture(); assert.throws(() => classify(f.scan, 0, f.locked, [windowsGraph(f.metadata, f.tree, f.locked.cargo)]), /Both default/);
});
test('CRLF tree, repeated paths and enabled features parse without dropping dependencies', () => {
  const f = fixture(); const tree = (f.tree + '1runtime v1.0.0|extra-feature\n').replaceAll('\n', '\r\n');
  assert.equal(windowsGraph(f.metadata, tree, f.locked.cargo).packages.length, 5);
});
test('truncated required subtree and malformed/de-duplicated/unknown/multiple-root trees fail', () => {
  const f = fixture();
  for (const tree of [
    '', '0app v1.0.0|', f.tree.replace('2macro v1.0.0 (proc-macro)|\n', ''),
    f.tree.replace('1runtime', '3runtime'), f.tree + '1unknown v1.0.0|\n',
    f.tree + '0app v1.0.0|\n', f.tree.replace('1runtime v1.0.0|', '1runtime v1.0.0 (*)|'),
    f.tree + 'bad output\n',
  ]) assert.throws(() => windowsGraph(f.metadata, tree, f.locked.cargo));
});
test('incomplete metadata, workspace and unsupported source cannot pass', () => {
  for (const mutate of [
    f => { f.metadata.resolve.nodes.pop(); },
    f => { f.metadata.workspace_members.push('another'); },
    f => { f.metadata.packages[1].source = 'git+https://example.test/repo'; },
    f => { f.locked.cargo = f.locked.cargo.filter(p => p.name !== 'runtime'); },
    f => { f.metadata.packages.push({ ...f.metadata.packages[1], id: 'duplicate' }); },
  ]) { const f = fixture(); mutate(f); assert.throws(() => windowsGraph(f.metadata, f.tree, f.locked.cargo)); }
});
test('all npm/Cargo entries are inventoried; unsupported lock sources/layouts fail', () => {
  const npm = { lockfileVersion: 3, packages: { '': {}, 'node_modules/a': { version: '1.0.0', resolved: 'https://registry.npmjs.org/a/-/a-1.0.0.tgz' } } };
  const cargo = 'version = 4\n\n[[package]]\nname = "app"\nversion = "1.0.0"\n\n[[package]]\nname = "dep"\nversion = "1.0.0"\nsource = "' + REG + '"\n';
  assert.equal(inventory(npm, cargo).cargo.length, 2);
  assert.equal(inventory(npm, cargo.replaceAll('\n', '\r\n')).cargo.length, 2);
  for (const text of [cargo.replace(REG, 'git+https://example.test'), cargo.replace('version = 4', 'version = 2'), cargo.replace('name = "dep"', '')]) assert.throws(() => inventory(npm, text));
  for (const change of [v => { v.link = true; }, v => { v.resolved = 'file:../a'; }, v => { delete v.version; }]) {
    const n = structuredClone(npm); change(n.packages['node_modules/a']); assert.throws(() => inventory(n, cargo));
  }
});
test('summary escapes advisory text and lists patch candidates', () => {
  const f = fixture(); finding(f, 'runtime');
  const r = evaluate(f, 1); r.blocking[0].ids = ['<unsafe>|line\nnext'];
  assert.match(summary(r), /&lt;unsafe&gt;&#124;line next/);
  assert.match(summary(r), /1\.0\.1/);
});

test('fix versions belong to the reported package, not another affected package', () => {
  const f = fixture(); finding(f, 'runtime');
  const v = f.scan.results[1].packages.find(p => p.package.name === 'runtime').vulnerabilities[0];
  v.affected.push({ package: { name: 'other', ecosystem: 'crates.io' }, ranges: [{ events: [{ fixed: '9.9.9' }] }] });
  assert.deepEqual(evaluate(f, 1).blocking[0].fixed, ['1.0.1']);
});
