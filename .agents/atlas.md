# Atlas Architectural Journal

## Architectural Insights & Decisions

### 1. Clean Layered Monolith with Out-of-Process Isolation
- **Pattern**: Enforced a unidirectional dependency tree (`Utilities` ➡️ `State` ➡️ `Domain Managers` ➡️ `Web API`). Circular dependencies are strictly forbidden.
- **Process Isolation**: Spawns third-party lifecycle scripts in isolated processes (`starter.ts`) to avoid blocking/crashing the parent process, using the shared `installed.json` registry file to synchronize status asynchronously.

## Architectural Fitness Functions
- Added `madge` dependency linter to ensure that no circular dependencies can be introduced.
- Added `"lint:deps"` script to `core/package.json` for CI/CD integration:
  `madge --circular --extensions ts --ts-config tsconfig.json src/`
- Verified that the current codebase has exactly **0 circular dependencies**.
