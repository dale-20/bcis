# Desktop workflow screenshots

These captures come from the built Electron E2E against its isolated PostgreSQL `_test` database. Subscriber, payment and GCash details are synthetic. The test regenerates them with `npm run test:e2e`; checked-in images are evidence from the successful run on 2026-10-11.

| Image | Screen |
| --- | --- |
| `dashboard.png` | Operational dashboard and AR summary |
| `subscriber-profile.png` | Synthetic subscriber profile and service accounts |
| `payment-receipt.png` | Posted Cash receipt |
| `gcash-review.png` | Unverified GCash proof awaiting an explicit review decision |
| `receivables-aging.png` | Month-end AR aging with all four nonzero overdue buckets |
| `reports.png` | Server-backed monthly collections report with PDF/XLSX save results |
| `collection-batch-detail.png` | Closed route batch with cash remittance and visible reconciliation difference |

The captures document desktop rendering; they do not replace the PostgreSQL integration assertions. The E2E test regenerates the closed batch detail capture from synthetic data. Report PDF page layout still needs visual review in a PDF viewer.
