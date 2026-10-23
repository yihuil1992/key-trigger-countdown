# Dependency security checks

The separate `OSV security` workflow runs for pull requests, pushes to `master`, daily at 04:23 UTC, and manual dispatch. It does not change the build or manual release workflows. Scheduled runs use the default branch; GitHub may delay scheduled jobs.

## Gate policy

- Scan **both complete lockfiles**, including all transitive npm and Cargo entries. Preserve the original OSV JSON even when the gate fails.
- Block vulnerabilities and Rust soundness findings in **all npm dependencies** (including dev and optional/platform packages), plus Rust packages selected for `x86_64-pc-windows-msvc`.
- Resolve two Windows profiles: manifest defaults and defaults plus `tauri/custom-protocol`. Gate their union. `cargo tree --edges normal,build` includes procedural macros; no proc-macro exclusion or dependency pruning is used.
- Display findings outside those selected profiles separately. This includes other platforms and inactive/dev-only Rust dependencies; it is not automatically proof that every excluded package is Linux-only.
- Display maintenance-only notices separately without blocking. A group is maintenance-only only if every matching affected record explicitly says `unmaintained`. Unknown informational kinds, mixed records, and `unsound` remain blocking when in scope.
- Merge scanner-provided advisory aliases. No severity threshold, ignore list, blanket platform suppression, or lockfile deletion is used.
- Fail on download/checksum errors, scanner failure, missing or incomplete lockfile coverage, Cargo resolution errors, malformed/incomplete graphs, or unsupported input layouts. These must never look like a clean scan.

Runner exit codes: **0** = completed and no blocking findings; **1** = completed with blocking findings; **2** = scan/coverage/tool failure. OSV itself returns 1 for findings including maintenance notices; the runner verifies the complete report before applying the narrower policy.

## Scope and execution safety

The scripts use Node built-ins only. No npm install, application build, Rust build script, or proc-macro execution is needed. A fresh temporary directory contains the two manifests, original lockfiles, and inert Rust target placeholders. Cargo reads metadata and dependency trees with `--locked`; the real source files are not copied or executed. Input hashes are checked after scanning. A deliberately empty OSV configuration prevents checkout-local suppressions, and Rust/Go call analysis is explicitly disabled.

Run on Windows so host build/proc-macro dependencies match the Windows target. The selected tree is reconciled with Cargo metadata: identities and normal/build edges must exist, required non-optional edges must be present, and metadata-only optional/feature-union entries are retained in the evidence. This is dependency membership, **not** proof of function execution, exploitability, or exact compiler/linker units.

Supported layout: one local `src-tauri` Cargo package, the existing `src/lib.rs`, `src/main.rs`, `build.rs` target paths, Cargo-generated lockfile v3/v4 with crates.io dependencies, and npm lockfile v3 with registry.npmjs.org entries. Workspaces/path/git/alternate-registry dependencies, checkout Cargo configuration, new explicit Rust target paths, or a new Cargo version require a deliberate coverage review. Unsupported inputs fail rather than silently losing coverage. Root package dependency ranges must agree between package.json and package-lock.json.

The two profiles reflect the current application build. Review them when adding build features, targets, architectures, or Rust dev/test dependencies. The full cross-platform lockfile still records excluded packages. Windows/WebView2 system components are outside OSV lockfile coverage.

The job has only `contents: read`, uses `pull_request` (never `pull_request_target`), does not persist checkout credentials or share dependency caches, and needs no secrets or SARIF/security-events upload. The workflow and policy changes themselves still need ordinary code review; this check does not establish branch protection.

## Reports

The `osv-<run-id>-<attempt>` artifact is retained for 14 days and uploaded with `always()`. The job summary separates blocking, outside-target and maintenance findings; the maintenance list may overlap the outside-target list.

- `osv-full.json`: unfiltered scanner output for both lockfiles.
- `assessment.json`: package/version/advisory/fixed-version classification and coverage counts.
- `windows-graphs.json`: default and custom-protocol packages, edges, and broader metadata identities.
- `metadata-*.stdout`, `tree-*.stdout`: original complete Cargo output, with separate stderr logs.
- `run.json`: commands, timestamps, exit codes, input hashes, scanner identity and errors.
- `summary.md`: human-readable outcome. Failed graph resolution can still retain the completed full scan.

If initialization or a tool download fails before the runner starts, use the failing workflow step logs; a missing artifact is also an error, not a pass. Job cancellation/timeouts cannot guarantee a completed upload.

## Pins and maintenance

| Tool | Version / immutable identity |
|---|---|
| OSV-Scanner | 2.7.0; Windows amd64 SHA-256 `9964ed64ec9a387391eb4cc006ad5c531154821aef29b793e02c448de4686438` |
| actions/checkout | v7.0.1 / `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| actions/setup-node | v7.1.0 / `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| actions/upload-artifact | v7.0.2 / `cf430e030ddbb5b0abf93d22962f4752f3646cd9` |
| Node / Cargo | 24.21.0 / 1.90.0; runner `windows-2025` |

Pins were checked against official GitHub release/tag records and exact action.yml schemas on 2026-10-23. The OSV asset hash also matches the official SHA256SUMS. This is checksum verification against a reviewed pin, not a separate SLSA signature verification. OSV queries the live advisory database on every run; pinning the executable does not freeze vulnerability data. Rustup installs the exact official toolchain and verifies its distribution checksums; the hosted runner image itself is maintained by GitHub.

To update OSV, verify the official release provenance/checksum, update the single `SCANNER` definition in `.github/scripts/osv-policy.mjs`, and rerun tests plus real passing/failing scans. Review output-schema/exit-code changes. To update Cargo, update the workflow and the runner version assertion together, then compare both profile graphs. Update Action SHAs and validate their declared inputs. Do not bypass a failing gate with package/advisory ignores.

## Local validation

From Windows with the pinned Cargo version available and a verified OSV executable:

```powershell
node --test .github/scripts/osv-policy.test.mjs
node .github/scripts/osv-check.mjs --scanner C:\path\osv-scanner.exe --output C:\Temp\osv-report-new
```

Use a new/empty output directory. An optional `--repo C:\path\fixture` scans a separate fixture without touching the real dependency graph. A Cargo cache can be reused through `CARGO_HOME` only when it has no custom config; CI uses a fresh isolated cache. Keep output outside the checkout.

At implementation, local validation covered:

- Current remediated locks: exit 0; 60 npm and 441 Cargo package versions, 241 selected Windows nodes including the app; 0 blockers, 2 outside-target findings, 6 maintenance notices (5 in the Windows graph).
- An isolated copy of the pre-remediation locks: exit 1 with Tauri/Vite and other in-scope advisories; glib/proc-macro-error stayed outside the selected Windows graph.
- Invalid Cargo TOML: exit 2 while retaining the successful full OSV report.
- Checkout Cargo configuration and a wrong scanner checksum: exit 2.
- Fixture npm install/build scripts that deliberately fail and a Rust build-script sentinel: scan passed without running them or creating the sentinel.
- Unit fixtures cover build/proc-macro and release-profile inclusion, aliases, versions, maintenance/soundness separation, missing coverage, scanner error codes, malformed/truncated trees and unsupported sources.
- actionlint 1.7.12, YAML parsing, and all inputs checked against the pinned Actions schemas.

Hosted GitHub Actions execution, artifact upload, PR event wiring and scheduled delivery cannot be validated end-to-end until an authorized push. After review, publish the branch/PR only with authorization, inspect the hosted security job and artifact, and verify manual dispatch after the workflow reaches the default branch. No settings or publication are performed by the local implementation.

## Official references

- [OSV installation and verification](https://google.github.io/osv-scanner/installation/)
- [OSV source scanning](https://google.github.io/osv-scanner/usage/scan-source)
- [OSV configuration overrides](https://google.github.io/osv-scanner/configuration/)
- [OSV output and exit codes](https://google.github.io/osv-scanner/output/)
- [Cargo tree feature and target semantics](https://doc.rust-lang.org/cargo/commands/cargo-tree.html)
- [Cargo metadata schema](https://doc.rust-lang.org/cargo/commands/cargo-metadata.html)
