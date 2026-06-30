# Radar Journal

## Local Testing Conventions
- Core testing framework: Vitest.
- Run tests via `npm run test` inside the `core` directory.
- Test files must be named `*.test.ts` and reside within `core/src/`.
- Tests are excluded from standard compilation targets using `exclude` in `core/tsconfig.json`.

## ESM Mocking Gotchas
- **Circular Dependencies**: `logger.ts` originally imported `LOGS_DIR` from `config.ts` while `config.ts` imported `Logger` from `logger.ts`. This was resolved by computing `LOGS_DIR` locally in `logger.ts` using `__dirname`.
- **Default/Named exports mock**: When mocking native/external Node modules like `fs` and `child_process` in ES Modules (ESM), ensure the mock factory returns both mock named exports and the `default` export property to cover both types of import statements.
