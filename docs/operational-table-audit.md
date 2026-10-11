# Operational Table Audit

**Reviewed:** 2026-10-11  
**Scope:** Required dense operational tables from the requirements checklist and the first implementation increment in `docs/remaining-work-plan.md`.

The checklist's dense-table criterion asks for sticky headers, search/filter/sort, bounded server pagination or virtualization, export, and visible status badges. Existing screens already implement several of these behaviors, so status below is per behavior rather than treating all tables as wholly missing. “Export” means a table-specific export action; report exports elsewhere in the app do not automatically satisfy it.

## Screen matrix

| Screen | Verified current behavior | Confirmed gaps / follow-up | Priority |
| --- | --- | --- | --- |
| Subscribers | Server search and status filter; server pagination; server sort by name/account/updated; status badges; keyboard-open rows. See `features/subscribers/SubscribersPage.tsx`, `SubscriberTable.tsx`, and `packages/shared/src/subscribers.ts`. | No table export action found. Verify sticky header and narrow-window behavior in the running UI. | P2 |
| Invoices | Server search and period/status/due-date/amount filters; bounded pagination; deterministic server sorting; status badges; keyboard-open rows and detail drawer; filtered XLSX export. See `features/billing/BillingPage.tsx`, `apps/api/src/billing/repository.ts`, and `packages/shared/src/billing.ts`. | Verify sticky header and narrow-window behavior. | P1 |
| Payment history | Server search, method/status/date filters; bounded pagination; stable server sorting by date, subscriber, receipt, status, or amount; keyboard-open rows; visible payment/receipt states and detail; PDF/XLSX export uses the same filters and sort with a 10,000-row cap. See `features/payments/PaymentsPage.tsx`, `apps/api/src/payments/repository.ts`, and `apps/api/src/reports/service.ts`. | Verify sticky header and narrow-window behavior in the running UI. | P1 |
| GCash proof review queue | Pending queue is paginated; pending status and count are visible; detail/proof review has loading/error handling and role-gated API access. Same payment page. | No search, filters, sorting, or queue export. This is a purpose-specific pending queue, so define operational value before expanding it; do not imply proof is posted revenue. | P2 |
| Collection batches / remittance | Server-paginated list (20 per page); search and status/date/collector/area filters; deterministic server sorting; XLSX export for the full matching filter/sort; status, route progress, and variance summary; batch details have loading/error/empty states; route sheet is printable. See `features/collections/CollectionBatchesPage.tsx`, `apps/api/src/collections/repository.ts`, and `packages/shared/src/collections.ts`. | Verify sticky header and narrow-window behavior. Remittance remains in the batch detail workflow rather than a separate filtered list. | P0 |
| Receivable aging | Server-paginated by date and collector/area; search across invoice, subscriber, account, and service; allowlisted stable sorting; filtered PDF/XLSX export capped at 10,000 invoices; loading/error/empty states; status/age badges; money values aligned. Export requires `report.export` and `receivables.view`. See `features/receivables/ReceivablesPage.tsx`, `apps/api/src/receivables/repository.ts`, `apps/api/src/reports/service.ts`, and `packages/shared/src/receivables.ts`. | Verify sticky header and narrow-window behavior in the running UI. | P2 |
| Overdue / service-control accounts | Server search, pagination, collector/area/plan/service-type/bucket/date/overdue filters; allowlisted server sort with stable tie-breakers; filtered PDF/XLSX export with a 10,000-row cap; visible age status and loading/error/empty states. Export requires `report.export` and `receivables.view`. See `features/receivables/ReceivablesPage.tsx`, `apps/api/src/service-control/repository.ts`, `apps/api/src/reports/service.ts`, and `packages/shared/src/service-control.ts`. | Verify sticky header and narrow-window behavior in the running UI. | P1 |

## Cross-screen findings

- Server pagination is present on the scoped high-volume lists; do not replace it with renderer-side loading of full production tables.
- Search, filters, sorting, and export are now present on collection batches, invoices, payments, overdue/service-control accounts, and receivable aging. Subscriber export is the remaining clear gap in this audit.
- Current schema/API contracts expose stable sort fields on invoice, payment, service-control, collection-batch, and receivable-aging lists.
- The checklist's table export item needs interpretation per workflow. Report exports already exist, but a filtered operational-list export is not evidenced by these screens. Before implementation, choose whether export is required for each table and ensure server-side permission and filter semantics match the visible result set.
- Status text/badges are present in the reviewed primary lists. Sticky headers, responsive overflow, focus visibility, and exact export completeness were not established from source inspection alone and need UI verification before marking the checklist row fully satisfied.
- The palette/typography checkbox in the checklist is stale as a blanket visual verdict: shared design tokens and typography are already present. Audit concrete table behaviors and visual edge cases instead of reopening a theme redesign.

## Recommended execution order

1. **Close P0 collection-batch list gap:** extend the shared list query with bounded search, status, date range, collector/area filters, and deterministic sort; implement parameterized server filtering and stable pagination; add API/integration coverage; then wire controls and loading/empty/error/accessibility states in the desktop list.
2. **Decide remaining list export scope:** subscriber export still needs a workflow-by-workflow requirement decision and implementation where justified. Invoice, payment, and receivable exports reuse authoritative report/export infrastructure, preserve filters, and enforce their server permissions.
3. **Add remaining sort controls:** invoice, payment, overdue/service-control, and receivable-aging lists now have allowlisted sort fields with deterministic tie-breakers.
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
