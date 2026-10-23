import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { SCANNER, TARGET, inventory, windowsGraph, classify, summary } from './osv-policy.mjs';

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const FILES = ['package.json', 'package-lock.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock'];

export async function main(args = process.argv.slice(2)) {
  const { values } = parseArgs({ args, options: { repo: { type: 'string', default: '.' }, output: { type: 'string' }, scanner: { type: 'string' } } });
  assert.ok(values.output, '--output is required');
  const repo = path.resolve(values.repo), output = path.resolve(values.output);
  assert.ok(!fs.existsSync(output) || fs.readdirSync(output).length === 0, 'Use a new/empty output directory');
  fs.mkdirSync(output, { recursive: true });
  const commands = [], status = { startedUtc: new Date().toISOString(), target: TARGET, errors: [], commands };
  const save = (name, value) => fs.writeFileSync(path.join(output, name), JSON.stringify(value, null, 2));
  const logStatus = () => save('run.json', status);
  let code = 2;
  const env = {
    ...process.env, CARGO_TERM_COLOR: 'never', CARGO_HTTP_TIMEOUT: '60', CARGO_NET_RETRY: '2',
    // Metadata/tree must never invoke a PR-supplied compiler wrapper.
    RUSTC_WRAPPER: '', RUSTC_WORKSPACE_WRAPPER: '', RUSTFLAGS: '', CARGO_ENCODED_RUSTFLAGS: '',
  };
  const run = async (label, executable, argv, cwd) => {
    const startedUtc = new Date().toISOString();
    const stdout = fs.openSync(path.join(output, label + '.stdout'), 'w');
    const stderr = fs.openSync(path.join(output, label + '.stderr'), 'w');
    let result;
    try {
      result = await new Promise((resolve, reject) => {
        const child = spawn(executable, argv, { cwd, env, windowsHide: true, stdio: ['ignore', stdout, stderr], timeout: 600_000 });
        child.on('error', reject); child.on('close', (exit, signal) => resolve({ exit, signal }));
      });
    } finally { fs.closeSync(stdout); fs.closeSync(stderr); }
    commands.push({ label, executable, arguments: argv, startedUtc, endedUtc: new Date().toISOString(), ...result });
    logStatus();
    assert.equal(result.signal, null, label + ' terminated');
    return result.exit;
  };
  try {
    assert.equal(process.platform, 'win32', 'Run on Windows: host build/proc-macro dependencies must match the target');
    assert.ok(values.scanner, '--scanner is required');
    const scanner = path.resolve(values.scanner);
    assert.equal(sha256(scanner), SCANNER.sha256, 'OSV binary checksum mismatch');
    status.scanner = SCANNER;
    const initial = FILES.map(file => ({ file, sha256: sha256(path.join(repo, file)) }));
    status.inputs = initial;
    // Do not load checkout-local Cargo configuration, tools, or build scripts.
    for (const f of ['.cargo/config', '.cargo/config.toml', 'src-tauri/.cargo/config', 'src-tauri/.cargo/config.toml']) {
      assert.ok(!fs.existsSync(path.join(repo, f)), 'Cargo config needs an explicit coverage review: ' + f);
    }
    const input = fs.mkdtempSync(path.join(output, 'inputs-'));
    fs.mkdirSync(path.join(input, 'src-tauri/src'), { recursive: true });
    for (const file of FILES) fs.copyFileSync(path.join(repo, file), path.join(input, file));
    // Cargo inspects target paths but does not compile them for metadata/tree.
    for (const file of ['src-tauri/src/lib.rs', 'src-tauri/src/main.rs', 'src-tauri/build.rs']) fs.writeFileSync(path.join(input, file), '// Metadata-only placeholder; never built.\n');
    const locked = inventory(readJson(path.join(input, 'package-lock.json')), fs.readFileSync(path.join(input, 'src-tauri/Cargo.lock'), 'utf8'));
    const manifest = readJson(path.join(input, 'package.json')), npmRoot = readJson(path.join(input, 'package-lock.json')).packages[''];
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) assert.deepEqual(manifest[field] ?? {}, npmRoot[field] ?? {}, 'npm manifest/lock mismatch: ' + field);
    if (!env.CARGO_HOME) env.CARGO_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'countdown-osv-cargo-'));
    for (const name of ['config', 'config.toml']) assert.ok(!fs.existsSync(path.join(env.CARGO_HOME, name)), 'Use a Cargo cache without custom configuration');
    fs.writeFileSync(path.join(output, 'empty-osv.toml'), '# No ignores or package overrides.\n');
    assert.equal(await run('scanner-version', scanner, ['--version'], input), 0, 'Scanner version failed');
    let scannerExit;
    try {
      scannerExit = await run('osv', scanner, ['scan', 'source', '--lockfile=package-lock.json', '--lockfile=src-tauri/Cargo.lock',
        '--format=json', '--all-packages', '--all-vulns', '--no-resolve', '--no-call-analysis=go', '--no-call-analysis=rust',
        '--config=' + path.join(output, 'empty-osv.toml'), '--output-file=' + path.join(output, 'osv-full.json')], input);
      assert.ok(scannerExit === 0 || scannerExit === 1, 'OSV failed: exit ' + scannerExit);
    } catch (error) { status.errors.push('Scan: ' + error.message); }
    const graphs = [];
    try {
      assert.equal(await run('cargo-version', 'cargo', ['--version'], input), 0, 'Cargo unavailable');
      assert.match(fs.readFileSync(path.join(output, 'cargo-version.stdout'), 'utf8'), /^cargo 1\.90\.0 /, 'Review the graph parser before changing pinned Cargo 1.90.0');
      const base = ['--locked', '--manifest-path', 'src-tauri/Cargo.toml'];
      for (const [name, features] of [['default', []], ['custom-protocol', ['--features', 'tauri/custom-protocol']]]) {
        assert.equal(await run('metadata-' + name, 'cargo', ['metadata', '--format-version=1', '--filter-platform', TARGET, ...base, ...features], input), 0, 'Cargo metadata failed: ' + name);
        assert.equal(await run('tree-' + name, 'cargo', ['tree', '--target', TARGET, '--edges', 'normal,build', '--prefix', 'depth', '--no-dedupe', '--format', '{p}|{f}', ...base, ...features], input), 0, 'Cargo tree failed: ' + name);
        const metadata = readJson(path.join(output, 'metadata-' + name + '.stdout'));
        const root = metadata.packages.find(p => p.id === metadata.resolve?.root);
        assert.ok(root?.targets.every(t => ['src/lib.rs', 'src/main.rs', 'build.rs'].some(f => path.resolve(t.src_path) === path.resolve(input, 'src-tauri', f))), 'New Cargo target layout needs coverage review');
        graphs.push(windowsGraph(metadata, fs.readFileSync(path.join(output, 'tree-' + name + '.stdout'), 'utf8'), locked.cargo));
      }
      save('windows-graphs.json', graphs);
    } catch (error) { status.errors.push('Graph: ' + error.message); }
    for (const entry of initial) {
      assert.equal(sha256(path.join(repo, entry.file)), entry.sha256, 'Input changed during scan: ' + entry.file);
      assert.equal(sha256(path.join(input, entry.file)), entry.sha256, 'Locked snapshot changed: ' + entry.file);
    }
    assert.equal(status.errors.length, 0, status.errors.join('\n'));
    const result = classify(readJson(path.join(output, 'osv-full.json')), scannerExit, locked, graphs);
    save('assessment.json', result);
    const report = summary(result);
    fs.writeFileSync(path.join(output, 'summary.md'), report);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
    code = result.blocking.length ? 1 : 0;
    status.outcome = code ? 'vulnerabilities-blocked' : 'pass';
    console.log('OSV gate: ' + status.outcome + '; blocking=' + result.blocking.length + ', outside=' + result.outsideTarget.length + ', maintenance=' + result.maintenance.length);
  } catch (error) {
    status.errors.push(error.message);
    status.outcome = 'scan-or-coverage-failure';
    const report = '## OSV dependency check: ERROR\n\nScan/graph/coverage did not complete. Do not treat this as a clean scan.\n\n' + status.errors.map(e => '- ' + e.replace(/[\r\n]/g, ' ')).join('\n') + '\n';
    fs.writeFileSync(path.join(output, 'summary.md'), report);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
    console.error(report);
  } finally {
    status.endedUtc = new Date().toISOString(); status.exitCode = code; logStatus();
  }
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then(code => { process.exitCode = code; }).catch(error => { console.error(error.message); process.exitCode = 2; });
}
