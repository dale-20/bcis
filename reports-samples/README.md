# Step 9 report samples

All sample data comes from the isolated synthetic PostgreSQL `_test` database. No customer data is included.

| Report | PDF | Excel |
| --- | --- | --- |
| Daily collections | [daily-collections.pdf](daily-collections.pdf) | [daily-collections.xlsx](daily-collections.xlsx) |
| Billing versus collection | [billing-versus-collection.pdf](billing-versus-collection.pdf) | [billing-versus-collection.xlsx](billing-versus-collection.xlsx) |
| Payment method summary | [payment-method-summary.pdf](payment-method-summary.pdf) | [payment-method-summary.xlsx](payment-method-summary.xlsx) |
| Accounts receivable aging | [accounts-receivable-aging.pdf](accounts-receivable-aging.pdf) | [accounts-receivable-aging.xlsx](accounts-receivable-aging.xlsx) |
| Subscriber statement | [subscriber-statement.pdf](subscriber-statement.pdf) | [subscriber-statement.xlsx](subscriber-statement.xlsx) |
| Collector remittance and performance | [collector-remittance-performance.pdf](collector-remittance-performance.pdf) | [collector-remittance-performance.xlsx](collector-remittance-performance.xlsx) |

`manifest.json` records the report parameters, generated totals, row counts, and automated checks. `npm run reports:samples` regenerates the files from the isolated database after rerunning the collection integration fixture.

Automated checks read each XLSX back and compare its title, date range, and totals to the API report. The PDF is generated from the same API report object and checked for its PDF signature and nontrivial size. The integration suite compares billing, aging, and subscriber statement totals with PostgreSQL source values. These checks do not assess pagination, clipping, whitespace, or readability in the rendered PDF.

**Pending acceptance check:** Open all six PDFs in a PDF viewer and inspect page breaks, table widths, clipped text, footer placement, and total visibility. If any issue appears, record the file and page and fix it before marking Step 9 complete. This workspace has no Poppler or other local PDF renderer, so that visual check could not be performed here.
