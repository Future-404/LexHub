# Sentinel Security Journal

## Vulnerability Patterns & Fixes

### 1. [LEXHUB-BUG-001] Broken Dynamic Require & Shell Command Injection Risk in Autostart
- **File**: `core/src/web/routes.ts`
- **Severity**: HIGH
- **OWASP Category**: A05:2025 - Injection / A03:2025 - Supply Chain Failures
- **Issue**:
  1. The route handlers for `/api/system/autostart` dynamically imported `LEXHUB_DIR` via `require('../manager/config.js')`. However, `LEXHUB_DIR` was never exported from `config.ts` (the correct constant was `ROOT_DIR`). This resulted in a TypeError, causing the autostart feature to break.
  2. The code ran the CLI binary via `execSync` inside a shell using template literals: `execSync(\`"${lhBin}" enable\`, ...)`. Running commands within a shell can expose applications to Shell/Command Injection (CWE-78) if the executable path or arguments are under external influence.
- **Remediation**:
  1. Refactored `routes.ts` to statically import `ROOT_DIR`, `MODULES_DIR`, and `LOGS_DIR` from `../manager/config.js` at the top of the file, completely removing all inner `require()` calls and fixing the ReferenceError/TypeError bugs.
  2. Replaced `execSync` shell executions with `spawnSync` calls using direct argument arrays (e.g. `spawnSync(lhBin, ['enable'])`), making the execution 100% immune to shell injection.

### 2. [LEXHUB-SEC-002] Remediate Nested Dependency Vulnerabilities & Upgrade to Fastify v5
- **Files**: `core/package.json`, `core/src/web/server.ts`
- **Severity**: CRITICAL / HIGH
- **OWASP Category**: A03:2025 - Supply Chain Failures
- **Issue**:
  - `npm audit` flagged 9 vulnerabilities (including 2 critical and 6 high).
  - Vulnerabilities included critical auth bypasses in `fast-jwt` (used by `@fastify/jwt`), reply forwarding bypasses in `@fastify/reply-from`, path traversal in `fast-uri` (used by `fastify`), and multiple smuggling/DoS vulnerabilities in `undici`.
- **Remediation**:
  1. Configured npm `"overrides"` in `package.json` to force safe nested dependency versions (`fast-uri` to `^3.1.2`, `fast-jwt` to `^6.2.4`, and nested `undici` under `@fastify/reply-from` to `^6.27.0`), avoiding version conflicts with root-level packages.
  2. Upgraded `@fastify/reply-from` to the latest secure version `12.6.2`.
  3. Upgraded `fastify` and all core plugins (`@fastify/cookie`, `@fastify/jwt`, `@fastify/static`, `@fastify/websocket`) to their latest major versions (Fastify v5), reducing the remaining vulnerability count to exactly zero.
  4. Fixed a TypeScript signature shift for `reply.redirect` inside `server.ts` from Fastify v5.

### 3. [LEXHUB-SEC-003] Eliminate Shell Injection in Mirror Routes & Last Dynamic require()
- **File**: `core/src/web/routes.ts`
- **Severity**: HIGH
- **OWASP Category**: A05:2025 - Injection
- **Issue**:
  1. Mirror management routes (`/api/system/mirrors`) used `exec()` (shell-based) to run npm/pip/sed/git commands, making them vulnerable to command injection via crafted action payloads.
  2. The store route at line 518 still contained a dynamic `require('../manager/network.js')` despite `NetworkManager` already being statically imported at the top of the file.
- **Remediation**:
  1. Replaced all `execAsync()` calls with `execFileSync()` using explicit argument arrays (no shell). The Termux `sed` path now uses `process.env.PREFIX` resolution instead of shell `$PREFIX` expansion.
  2. Removed the redundant dynamic `require()` — the static ESM import was already available.

### 4. [LEXHUB-SEC-004] Module Log Rotation & Git Command Hardening
- **Files**: `core/src/manager/process.ts`, `modules/sillytavern/lifecycle.js`
- **Severity**: HIGH / MEDIUM
- **Issue**:
  1. Module stdout/stderr logs were appended without any size limit. Long-running modules could fill the entire disk.
  2. `lifecycle.js` used `execSync('git ...')` shell strings for version detection, and `network.getSmartUrl()` return values were passed to git without protocol validation.
- **Remediation**:
  1. Added 10MB log rotation with 1-backup retention to `ProcessManager.startModule()`. Logs rotate on spawn and via a 60-second periodic check, with cleanup on process exit.
  2. Replaced all `execSync` shell strings with `execFileSync` argument arrays in `lifecycle.js`.
  3. Added `validateGitUrl()` (HTTPS-only protocol check) and `validateGitRef()` (alphanumeric ref name check) guards to `update()`, `switchChannel()`, and `unlock()`.
