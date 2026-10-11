# Operational Table Audit

**Reviewed:** 2026-10-11  
**Scope:** Required dense operational tables from the requirements checklist and the first implementation increment in `docs/remaining-work-plan.md`.

The checklist's dense-table criterion asks for sticky headers, search/filter/sort, bounded server pagination or virtualization, export, and visible status badges. Existing screens already implement several of these behaviors, so status below is per behavior rather than treating all tables as wholly missing. “Export” means a table-specific export action; report exports elsewhere in the app do not automatically satisfy it.

## Screen matrix

| Screen | Verified current behavior | Confirmed gaps / follow-up | Priority |
| --- | --- | --- | --- |
| Subscribers | Server search and status filter; server pagination; server sort by name/account/updated; status badges; keyboard-open rows. See `features/subscribers/SubscribersPage.tsx`, `SubscriberTable.tsx`, and `packages/shared/src/subscribers.ts`. | No table export action found. Verify sticky header and narrow-window behavior in the running UI. | P2 |
| Invoices | Server search, period/status/date/amount filters; bounded pagination; status badges; keyboard-open rows and detail drawer. See `features/billing/BillingPage.tsx` and `packages/shared/src/billing.ts`. | No list sort control or table export action found. Verify sticky header and narrow-window behavior. | P1 |
| Payment history | Server search, method/status/date filters; bounded pagination; keyboard-open rows; visible payment/receipt states and detail. See `features/payments/PaymentsPage.tsx` and `packages/shared/src/payments.ts`. | No sort control or history-table export action found. Verify sticky header and narrow-window behavior. | P1 |
| GCash proof review queue | Pending queue is paginated; pending status and count are visible; detail/proof review has loading/error handling and role-gated API access. Same payment page. | No search, filters, sorting, or queue export. This is a purpose-specific pending queue, so define operational value before expanding it; do not imply proof is posted revenue. | P2 |
| Collection batches / remittance | Server-paginated list (20 per page); status, collector/area, route date, amount, progress, and variance summary displayed. Batch detail has loading/error/empty states; route sheet is printable. See `features/collections/CollectionBatchesPage.tsx` and `packages/shared/src/collections.ts`. | Confirmed gap: list contract only accepts `page`, `pageSize`, and `exceptionsOnly`; UI only sends page/pageSize. Search, status/date/collector/area filters, sorting, and list export are absent. Remittance is currently reached through this list/detail workflow rather than a separate filtered list. | P0 |
| Receivable aging | Server-paginated by date and overdue/collector/area; loading/error/empty states; status/age badges; money values aligned. See `features/receivables/ReceivablesPage.tsx` and `packages/shared/src/receivables.ts`. | No free-text search, sorting, or export on aging table. Verify sticky header and narrow-window behavior. | P2 |
| Overdue / service-control accounts | Server search and pagination; filters for collector, area, plan, service type, delinquency bucket, date and overdue mode; visible age status; loading/error/empty states. See `features/receivables/ReceivablesPage.tsx` and `packages/shared/src/service-control.ts`. | No sort control or table export action found. Verify sticky header and narrow-window behavior. | P1 |

## Cross-screen findings

- Server pagination is present on the scoped high-volume lists; do not replace it with renderer-side loading of full production tables.
- Search, filters, and sorting are uneven. Subscriber list is the strongest reference implementation. Collection batches are the clearest functional gap because their API contract and UI both lack operational narrowing controls.
- Current schema/API contracts do not expose stable sort fields for invoice, payment, receivable-aging, service-control, or collection-batch lists. Sorting requires a shared-contract and server-query change, with deterministic tie-breakers; it cannot be safely added only in React.
- The checklist's table export item needs interpretation per workflow. Report exports already exist, but a filtered operational-list export is not evidenced by these screens. Before implementation, choose whether export is required for each table and ensure server-side permission and filter semantics match the visible result set.
- Status text/badges are present in the reviewed primary lists. Sticky headers, responsive overflow, focus visibility, and exact export completeness were not established from source inspection alone and need UI verification before marking the checklist row fully satisfied.
- The palette/typography checkbox in the checklist is stale as a blanket visual verdict: shared design tokens and typography are already present. Audit concrete table behaviors and visual edge cases instead of reopening a theme redesign.

## Recommended execution order

1. **Close P0 collection-batch list gap:** extend the shared list query with bounded search, status, date range, collector/area filters, and deterministic sort; implement parameterized server filtering and stable pagination; add API/integration coverage; then wire controls and loading/empty/error/accessibility states in the desktop list.
2. **Decide and implement list export scope:** confirm which operational lists must export under the PDF requirement. Reuse authoritative server-side report/export infrastructure, preserve current filters, enforce `report.export`, and avoid exporting only the currently loaded page unless the UI labels that limitation.
3. **Add sort where operators need it:** start with invoices, payments, overdue accounts, and receivable aging. Add sort fields to Zod contracts and stable database ordering with a unique tie-breaker before exposing header controls.
4. **Verify table presentation:** inspect sticky headers, horizontal overflow, keyboard focus, status text, right-aligned tabular money, and narrow-window behavior across all scoped screens. Update the checklist only from concrete evidence.

## Evidence and limitations

Primary implementation references:

- `apps/desktop/src/renderer/src/features/subscribers/SubscribersPage.tsx`
- `apps/desktop/src/renderer/src/features/subscribers/SubscriberTable.tsx`
- `apps/desktop/src/renderer/src/features/billing/BillingPage.tsx`
- `apps/desktop/src/renderer/src/features/payments/PaymentsPage.tsx`
- `apps/desktop/src/renderer/src/features/collections/CollectionBatchesPage.tsx`
- `apps/desktop/src/renderer/src/features/receivables/ReceivablesPage.tsx`
- `packages/shared/src/subscribers.ts`, `billing.ts`, `payments.ts`, `collections.ts`, `receivables.ts`, and `service-control.ts`
- Requirement summary: `docs/implementation-checklist.md`, Milestone 8; detailed scope and sequence: `docs/remaining-work-plan.md`, Work sequence 1.

This is a source/API-contract audit, not a live visual review. Sticky positioning, responsive behavior, real keyboard traversal, and export fidelity remain unverified. No product behavior or database schema was changed as part of this audit.
