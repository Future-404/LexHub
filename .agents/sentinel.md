# Sentinel Security Insights

## Vulnerability Heuristics
- **Path Traversal / Prefix-Matching Bypass (CWE-22)**: When validating that a resolved path is within a designated base directory (e.g. using `.startsWith()`), matching raw string prefixes without verifying directory separators allows attackers to bypass boundary restrictions by creating siblings with matching name prefixes (e.g. `/root/LexHub_Backup-dangerous` matching `/root/LexHub_Backup`).
- **Remediation**: Always ensure that the prefix boundary is enforced either by comparing exact path equivalence or by appending `path.sep` (e.g. `allowedBase + path.sep`) before checking `.startsWith()`.

## Shipped Remediations
- **2026-06-30**: Fixed path traversal prefix bypass vulnerability in backup restore route (`/api/modules/:id/restore`) in `core/src/web/routes.ts`.
