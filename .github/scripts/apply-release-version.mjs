import { readFileSync, writeFileSync } from 'node:fs';

const version = process.env.APP_VERSION;

if (!version) {
  throw new Error('APP_VERSION is required');
}

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Version '${version}' is not valid semver. Use a value like 1.0.12 or 1.0.12-beta.1.`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

const packageJson = readJson('package.json');
packageJson.version = version;
writeJson('package.json', packageJson);

const packageLock = readJson('package-lock.json');
packageLock.version = version;

if (packageLock.packages?.['']) {
  packageLock.packages[''].version = version;
}

writeJson('package-lock.json', packageLock);

const tauriConfig = readJson('src-tauri/tauri.conf.json');
tauriConfig.version = version;
writeJson('src-tauri/tauri.conf.json', tauriConfig);

const cargoTomlPath = 'src-tauri/Cargo.toml';
const cargoToml = readFileSync(cargoTomlPath, 'utf8').replace(
  /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+(")/,
  `$1${version}$2`,
);
writeFileSync(cargoTomlPath, cargoToml);

const cargoLockPath = 'src-tauri/Cargo.lock';
const cargoLock = readFileSync(cargoLockPath, 'utf8').replace(
  /(\[\[package\]\]\s*\nname = "key-trigger-countdown"\s*\nversion = ")[^"]+(")/,
  `$1${version}$2`,
);
writeFileSync(cargoLockPath, cargoLock);

console.log(`Applied release version ${version}`);
