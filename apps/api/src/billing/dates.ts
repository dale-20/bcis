export interface PeriodBounds { periodStart: string; periodEnd: string }
export interface InvoiceDates { invoiceDate: string; dueDate: string }

function isoDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function periodBounds(period: string): PeriodBounds {
  const [yearText, monthText] = period.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || year < 1 || month < 1 || month > 12) {
    throw new Error('INVALID_BILLING_PERIOD');
  }
  return { periodStart: isoDate(year, month, 1), periodEnd: isoDate(year, month, daysInMonth(year, month)) };
}

export function invoiceDates(period: string, billingStartDate: string, billingDay: number, dueDay: number): InvoiceDates {
  const { periodStart, periodEnd } = periodBounds(period);
  const [yearText, monthText] = period.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const scheduledDate = isoDate(year, month, Math.min(billingDay, daysInMonth(year, month)));
  const invoiceDate = billingStartDate > scheduledDate && billingStartDate <= periodEnd ? billingStartDate : scheduledDate;
  if (billingStartDate > periodEnd || invoiceDate < periodStart) throw new Error('SERVICE_NOT_BILLABLE_FOR_PERIOD');

  let dueYear = year;
  let dueMonth = month;
  let dueDate = isoDate(dueYear, dueMonth, Math.min(dueDay, daysInMonth(dueYear, dueMonth)));
  if (dueDate < invoiceDate) {
    dueMonth += 1;
    if (dueMonth === 13) { dueMonth = 1; dueYear += 1; }
    dueDate = isoDate(dueYear, dueMonth, Math.min(dueDay, daysInMonth(dueYear, dueMonth)));
  }
  return { invoiceDate, dueDate };
}
