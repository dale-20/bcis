import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import ExcelJS from 'exceljs';
import { config } from 'dotenv';
import { createDatabase } from '../apps/api/dist/db/client.js';
import { ReportService } from '../apps/api/dist/reports/service.js';

config({ path: 'apps/api/.env', quiet: true });
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test') || databaseUrl === process.env.DATABASE_URL) {
  throw new Error('Report samples require the isolated TEST_DATABASE_URL ending in _test.');
}

const database = createDatabase({ DATABASE_URL: databaseUrl, DATABASE_POOL_MAX: 2 });
const service = new ReportService(database);
const outputDirectory = resolve('reports-samples');
const requestRange = { from: '2026-01-01', to: '2026-12-31' };
await mkdir(outputDirectory, { recursive: true });
const manifest = [];
try {
  const [source, subscriber] = await Promise.all([
    database.pool.query(`select (select count(*)::int from subscribers) subscribers,
        (select count(*)::int from invoices where status <> 'DRAFT') invoices,
        (select count(*)::int from payments where status='POSTED') payments,
        (select count(*)::int from collector_remittances) remittances`),
    database.pool.query('select id from subscribers order by account_number limit 1'),
  ]);
  const sourceCounts = source.rows[0];
  const subscriberId = subscriber.rows[0]?.id;
  if (typeof subscriberId !== 'string' || !sourceCounts || Number(sourceCounts.subscribers) === 0 || Number(sourceCounts.invoices) === 0 || Number(sourceCounts.payments) === 0 || Number(sourceCounts.remittances) === 0) {
    throw new Error('Run `npm run reports:samples` to reseed the isolated integration database before exporting samples.');
  }
  const samples = [
    { filename: 'daily-collections', request: { ...requestRange, report: 'DAILY_COLLECTIONS' } },
    { filename: 'billing-versus-collection', request: { ...requestRange, report: 'BILLING_VS_COLLECTION' } },
    { filename: 'payment-method-summary', request: { ...requestRange, report: 'PAYMENT_METHODS' } },
    { filename: 'accounts-receivable-aging', request: { ...requestRange, report: 'AR_AGING' } },
    { filename: 'subscriber-statement', request: { ...requestRange, report: 'SUBSCRIBER_STATEMENT', subscriberId } },
    { filename: 'collector-remittance-performance', request: { ...requestRange, report: 'COLLECTOR_REMITTANCE' } },
  ];
  for (const sample of samples) {
    const report = await service.report(sample.request);
    const xlsx = await service.export(report, 'XLSX');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(xlsx);
    const sheet = workbook.worksheets[0];
    if (!sheet || sheet.getCell('A1').value !== report.title || sheet.getCell('A2').value !== report.subtitle) {
      throw new Error(`XLSX metadata mismatch for ${sample.filename}.`);
    }
    const expectedTotals = new Map(report.totals.map((total) => [total.label, total.value]));
    const foundTotals = new Map();
    for (let rowNumber = 5; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const label = sheet.getCell(rowNumber, 1).text;
      const value = sheet.getCell(rowNumber, 2).text;
      if (expectedTotals.has(label)) foundTotals.set(label, value);
    }
    for (const [label, value] of expectedTotals) {
      if (foundTotals.get(label) !== value) throw new Error(`XLSX total mismatch for ${sample.filename}: ${label}.`);
    }

    const pdf = await service.export(report, 'PDF');
    if (pdf.subarray(0, 4).toString() !== '%PDF' || pdf.byteLength < 1_000) throw new Error(`Invalid PDF output for ${sample.filename}.`);
    await writeFile(resolve(outputDirectory, `${sample.filename}.xlsx`), xlsx);
    await writeFile(resolve(outputDirectory, `${sample.filename}.pdf`), pdf);
    manifest.push({
      files: [`${sample.filename}.pdf`, `${sample.filename}.xlsx`],
      report: report.report,
      title: report.title,
      subtitle: report.subtitle,
      generatedAt: report.generatedAt,
      rowCount: report.rows.length,
      totals: report.totals,
      xlsxMetadataVerified: true,
      xlsxTotalsVerified: true,
      pdfSignatureVerified: true,
    });
  }
  await writeFile(resolve(outputDirectory, 'manifest.json'), `${JSON.stringify({ source: 'synthetic isolated _test database', pdfVisualReview: 'pending - requires a local PDF renderer', samples: manifest }, null, 2)}\n`);
} finally {
  await database.close();
}
