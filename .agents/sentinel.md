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
