# Milestone 1 defect and correction log

| Defect | Root cause | Correction | Regression evidence |
| --- | --- | --- | --- |
| Invalid centavo strings threw instead of returning validation failures | Zod ran a BigInt refinement after a regex failure | Pipe validated strings into range checks; bound input to 19 digits | Invalid decimal, exponent, NaN, overflow, signed and numeric input tests |
| Invalid API URL could reach URL constructor | Refinement sequencing had the same issue | Pipe URL validation before origin restrictions | Empty/malformed/credential/path/query/fragment URL tests |
| Initial typecheck rejected an unused React import | Automatic JSX transform does not require React default import | Removed unused import and configured automatic JSX for Vitest | Strict typecheck and renderer component tests |
| Drizzle generator could not launch esbuild in sandbox | Windows process restriction (`spawn EPERM`) | Ran the same authorized generator in allowed execution context | Generated SQL and migration integration tests |
| Dependency audit reported six moderate transitive findings | Older esbuild via Drizzle loader and uuid via ExcelJS | Targeted uuid override; no forced downgrade of Drizzle or ExcelJS. Legacy Drizzle development dependency remains tracked. | Audit and export-library smoke check recorded in milestone report |
| Built Electron opened without the typed bridge | The sandboxed CommonJS preload externalized the shared ESM workspace package | Bundled `@bcis/shared` into the preload while retaining the narrow bridge | Built Electron login/subscriber E2E and exact bridge-key assertion |
| Subscriber list omitted contacts, addresses, and service counts | Correlated computed columns did not resolve the related rows in the list query | Replaced them with explicit primary-record joins and distinct service aggregates | PostgreSQL list assertion plus built Electron directory workflow |
| Billing migration initially referenced a nonexistent metadata timestamp column | The version sentinel contains `created_at` but no mutable timestamp | Updated only `schema_version`, then reran clean and repeat migrations | Four PostgreSQL integration files and 30 tests passed |

Financial acceptance defects will be tracked when those workflows exist. These foundation checks do not prove allocation, receipts, reversals, or financial concurrency.
