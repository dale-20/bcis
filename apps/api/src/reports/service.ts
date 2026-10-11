import ExcelJS from 'exceljs';
import pdfmake from 'pdfmake';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import type { Dashboard, DashboardQuery, ReportData, ReportRequest, ServiceHistory } from '@bcis/shared';
import type { Database } from '../db/client.js';

type Row = Record<string, unknown>;
const text = (value: unknown) => value === null || value === undefined ? '' : String(value);
const cents = (value: unknown) => BigInt(text(value) || '0').toString();
const iso = (value: unknown) => value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
const money = (value: string) => {
  const cents = BigInt(value);
  const pesos = cents / 100n;
  const fraction = (cents < 0n ? -cents : cents) % 100n;
  return `${new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(pesos)}.${fraction.toString().padStart(2, '0')}`;
};
const displayNameSql = "coalesce(s.organization_name, concat_ws(' ', s.first_name, s.last_name))";

export class ReportService {
  constructor(private readonly database: Database) {}

  async dashboard(query: DashboardQuery): Promise<Dashboard> {
    const args = [query.from, query.to];
    const [summary, monthly, methods, aging, recent, collectorPerformance] = await Promise.all([
      this.database.pool.query(`select
        coalesce((select sum(amount_centavos) from payments where status='POSTED' and payment_date >= $1::date and payment_date < $2::date + interval '1 day'),0)::bigint collected,
        coalesce((select sum(total_centavos) from invoices where status <> 'VOID' and status <> 'DRAFT' and invoice_date >= $1::date and invoice_date <= $2::date),0)::bigint billed,
        (select count(*) from payments where status='POSTED' and payment_date >= $1::date and payment_date < $2::date + interval '1 day')::int payment_count,
        coalesce((select sum(balance_centavos) from invoices where balance_centavos > 0 and status in ('UNPAID','PARTIALLY_PAID','OVERDUE')),0)::bigint outstanding,
        coalesce((select sum(balance_centavos) from invoices where balance_centavos > 0 and due_date < current_date and status in ('UNPAID','PARTIALLY_PAID','OVERDUE')),0)::bigint overdue,
        (select count(*) from invoices where balance_centavos > 0 and due_date < current_date and status in ('UNPAID','PARTIALLY_PAID','OVERDUE'))::int overdue_invoice_count,
        (select count(distinct subscriber_id) from invoices where balance_centavos > 0 and due_date < current_date and status in ('UNPAID','PARTIALLY_PAID','OVERDUE'))::int overdue_subscriber_count,
        (select count(*) from subscribers where status='ACTIVE')::int active_subscribers`, args),
      this.database.pool.query(`select to_char(date_trunc('month', payment_date),'YYYY-MM') collection_month, sum(amount_centavos)::bigint amount, count(*)::int count from payments where status='POSTED' and payment_date >= $1::date and payment_date < $2::date + interval '1 day' group by 1 order by 1`, args),
      this.database.pool.query(`select method, sum(amount_centavos)::bigint amount, count(*)::int count from payments where status='POSTED' and payment_date >= $1::date and payment_date < $2::date + interval '1 day' group by method order by amount desc`, args),
      this.database.pool.query(`select
        coalesce(sum(case when due_date >= current_date then balance_centavos else 0 end),0)::bigint current_amount,
        coalesce(sum(case when current_date-due_date between 1 and 30 then balance_centavos else 0 end),0)::bigint b1,
        coalesce(sum(case when current_date-due_date between 31 and 60 then balance_centavos else 0 end),0)::bigint b2,
        coalesce(sum(case when current_date-due_date between 61 and 90 then balance_centavos else 0 end),0)::bigint b3,
        coalesce(sum(case when current_date-due_date > 90 then balance_centavos else 0 end),0)::bigint b4
        from invoices where balance_centavos > 0 and status in ('UNPAID','PARTIALLY_PAID','OVERDUE')`),
      this.database.pool.query(`select p.id, r.receipt_number, ${displayNameSql} subscriber_name, p.method, p.amount_centavos amount, p.payment_date from payments p join subscribers s on s.id=p.subscriber_id join receipts r on r.payment_id=p.id where p.status='POSTED' order by p.payment_date desc limit 8`),
      this.database.pool.query(`select c.id collector_id,c.name collector_name,
        (select count(*)::int from collection_batches cb join collection_batch_accounts a on a.batch_id=cb.id where cb.collector_id=c.id and cb.collection_date between $1::date and $2::date) assigned_accounts,
        (select count(*)::int from collection_batches cb join collection_batch_accounts a on a.batch_id=cb.id where cb.collector_id=c.id and cb.collection_date between $1::date and $2::date and a.payment_id is not null) collected_accounts,
        coalesce((select sum(p.amount_centavos) from collection_batches cb join collection_batch_accounts a on a.batch_id=cb.id join payments p on p.id=a.payment_id and p.status='POSTED' where cb.collector_id=c.id and cb.collection_date between $1::date and $2::date),0)::bigint amount,
        coalesce((select sum(cr.difference_centavos) from collection_batches cb join collector_remittances cr on cr.batch_id=cb.id where cb.collector_id=c.id and cb.collection_date between $1::date and $2::date),0)::bigint variance
        from collectors c where c.status='ACTIVE' order by c.collector_number`, args),
    ]);
    const s = summary.rows[0] as Row; const a = aging.rows[0] as Row;
    return {
      range: query, billedCentavos: cents(s.billed), collectedCentavos: cents(s.collected), outstandingCentavos: cents(s.outstanding), overdueCentavos: cents(s.overdue),
      overdueInvoiceCount: Number(s.overdue_invoice_count), overdueSubscriberCount: Number(s.overdue_subscriber_count),
      activeSubscribers: Number(s.active_subscribers), postedPaymentCount: Number(s.payment_count),
      monthlyCollections: monthly.rows.map((r: Row) => ({ month: text(r.collection_month), amountCentavos: cents(r.amount), count: Number(r.count) })),
      paymentMethods: methods.rows.map((r: Row) => ({ method: text(r.method), amountCentavos: cents(r.amount), count: Number(r.count) })),
      collectorPerformance: collectorPerformance.rows.map((r: Row) => ({ collectorId: text(r.collector_id), collectorName: text(r.collector_name), assignedAccounts: Number(r.assigned_accounts), collectedAccounts: Number(r.collected_accounts), amountCentavos: cents(r.amount), varianceCentavos: cents(r.variance) })),
      aging: { CURRENT: cents(a.current_amount), '1_30': cents(a.b1), '31_60': cents(a.b2), '61_90': cents(a.b3), '90_PLUS': cents(a.b4) },
      recentPayments: recent.rows.map((r: Row) => ({ id: text(r.id), receiptNumber: text(r.receipt_number), subscriberName: text(r.subscriber_name), method: text(r.method), amountCentavos: cents(r.amount), paymentDate: iso(r.payment_date) })),
    };
  }

  async report(request: ReportRequest): Promise<ReportData> {
    const generatedAt = new Date().toISOString();
    if (request.report === 'DAILY_COLLECTIONS' || request.report === 'WEEKLY_COLLECTIONS' || request.report === 'MONTHLY_COLLECTIONS' || request.report === 'ANNUAL_COLLECTIONS') {
      const collectionPeriods = {
        DAILY_COLLECTIONS: { trunc: 'day', format: 'YYYY-MM-DD', title: 'Daily collections', label: 'Date' },
        WEEKLY_COLLECTIONS: { trunc: 'week', format: 'IYYY-"W"IW', title: 'Weekly collections', label: 'ISO week' },
        MONTHLY_COLLECTIONS: { trunc: 'month', format: 'Mon YYYY', title: 'Monthly collections', label: 'Month' },
        ANNUAL_COLLECTIONS: { trunc: 'year', format: 'YYYY', title: 'Annual collections', label: 'Year' },
      } as const;
      const period = collectionPeriods[request.report];
      const result = await this.database.pool.query(`with scoped_payments as (
        select amount_centavos, payment_date at time zone 'Asia/Manila' as business_date
        from payments
        where status='POSTED'
          and payment_date >= ($1::date::timestamp at time zone 'Asia/Manila')
          and payment_date < (($2::date + 1)::timestamp at time zone 'Asia/Manila')
      )
      select to_char(date_trunc('${period.trunc}',business_date),'${period.format}') period,
        count(*)::int transactions, sum(amount_centavos)::bigint amount
      from scoped_payments group by date_trunc('${period.trunc}',business_date)
      order by date_trunc('${period.trunc}',business_date)`, [request.from, request.to]);
      const rows = result.rows.map((r: Row) => ({ period: text(r.period), transactions: text(r.transactions), amount: money(cents(r.amount)) }));
      return this.data(request, period.title, rows, [{ label: 'Total collected', value: money(result.rows.reduce((n: bigint, r: Row) => n + BigInt(cents(r.amount)), 0n).toString()) }], [{key:'period',label:period.label},{key:'transactions',label:'Payments',align:'right'},{key:'amount',label:'Collected',align:'right'}], generatedAt);
    }
    if (request.report === 'BILLING_VS_COLLECTION') {
      const [billing, collections] = await Promise.all([
        this.database.pool.query(`select count(*)::int transactions,coalesce(sum(total_centavos),0)::bigint amount
          from invoices where status not in ('DRAFT','VOID') and invoice_date between $1::date and $2::date`, [request.from, request.to]),
        this.database.pool.query(`select count(*)::int transactions,coalesce(sum(amount_centavos),0)::bigint amount
          from payments where status='POSTED'
            and payment_date >= ($1::date::timestamp at time zone 'Asia/Manila')
            and payment_date < (($2::date + 1)::timestamp at time zone 'Asia/Manila')`, [request.from, request.to]),
      ]);
      const billed = billing.rows[0] as Row;
      const collected = collections.rows[0] as Row;
      const billedAmount = BigInt(cents(billed.amount));
      const collectedAmount = BigInt(cents(collected.amount));
      const rows = [
        { basis: 'Finalized invoices', dateBasis: 'Invoice date', transactions: text(billed.transactions), amount: money(billedAmount.toString()) },
        { basis: 'Posted payments', dateBasis: 'Payment date (Manila)', transactions: text(collected.transactions), amount: money(collectedAmount.toString()) },
      ];
      return this.data(request, 'Billing versus collection', rows, [
        { label: 'Billed', value: money(billedAmount.toString()) },
        { label: 'Collected', value: money(collectedAmount.toString()) },
        { label: 'Billed less collected', value: money((billedAmount - collectedAmount).toString()) },
      ], [
        { key: 'basis', label: 'Measure' }, { key: 'dateBasis', label: 'Date basis' },
        { key: 'transactions', label: 'Transactions', align: 'right' }, { key: 'amount', label: 'Amount', align: 'right' },
      ], generatedAt);
    }
    if (request.report === 'REVENUE_BY_PLAN' || request.report === 'REVENUE_BY_SERVICE' || request.report === 'REVENUE_BY_AREA') {
      const dimension = {
        REVENUE_BY_PLAN: { expression: "split_part(ii.description, ' monthly subscription - ', 1)", title: 'Billed subscription revenue by plan', label: 'Plan' },
        REVENUE_BY_SERVICE: { expression: 'st.name', title: 'Billed subscription revenue by service', label: 'Service type' },
        REVENUE_BY_AREA: { expression: "coalesce(ca.name, 'Unassigned area')", title: 'Billed subscription revenue by current area', label: 'Current area' },
      } as const;
      const selected = dimension[request.report];
      const result = await this.database.pool.query(`select ${selected.expression} dimension,
          count(distinct i.id)::int invoices,coalesce(sum(ii.amount_centavos),0)::bigint amount
        from invoice_items ii join invoices i on i.id=ii.invoice_id
        join service_accounts sa on sa.id=i.service_account_id
        join service_plans sp on sp.id=sa.plan_id join service_types st on st.id=sp.service_type_id
        left join collection_areas ca on ca.id=sa.collection_area_id
        where ii.type='SUBSCRIPTION' and i.status not in ('DRAFT','VOID') and i.invoice_date between $1::date and $2::date
        group by ${selected.expression} order by sum(ii.amount_centavos) desc,${selected.expression}`, [request.from, request.to]);
      const rows = result.rows.map((row: Row) => ({ dimension: text(row.dimension), invoices: text(row.invoices), amount: money(cents(row.amount)) }));
      const total = result.rows.reduce((sum: bigint, row: Row) => sum + BigInt(cents(row.amount)), 0n);
      return this.data(request, selected.title, rows, [
        { label: 'Subscription invoices', value: String(result.rows.reduce((sum: number, row: Row) => sum + Number(row.invoices), 0)) },
        { label: 'Billed subscription amount', value: money(total.toString()) },
      ], [
        { key: 'dimension', label: selected.label }, { key: 'invoices', label: 'Invoices', align: 'right' }, { key: 'amount', label: 'Billed', align: 'right' },
      ], generatedAt);
    }
    if (request.report === 'SUBSCRIBER_MASTER_LIST') {
      const result = await this.database.pool.query(`select s.account_number,${displayNameSql} subscriber,s.status,
          count(sa.id)::int service_accounts,count(sa.id) filter (where sa.status='ACTIVE')::int active_services,
          coalesce(string_agg(distinct ca.name, ', ' order by ca.name),'Unassigned') areas,
          coalesce(balance.outstanding,0)::bigint outstanding
        from subscribers s
        left join service_accounts sa on sa.subscriber_id=s.id
        left join collection_areas ca on ca.id=sa.collection_area_id
        left join lateral (select sum(i.balance_centavos)::bigint outstanding from invoices i where i.subscriber_id=s.id and i.balance_centavos>0 and i.status in ('UNPAID','PARTIALLY_PAID','OVERDUE')) balance on true
        group by s.id,balance.outstanding order by s.account_number`);
      const rows = result.rows.map((row: Row) => ({ account: text(row.account_number), subscriber: text(row.subscriber), status: text(row.status), serviceAccounts: text(row.service_accounts), activeServices: text(row.active_services), areas: text(row.areas), outstanding: money(cents(row.outstanding)) }));
      return this.data(request, 'Subscriber master list', rows, [
        { label: 'Subscribers', value: String(rows.length) },
        { label: 'Outstanding', value: money(result.rows.reduce((sum: bigint, row: Row) => sum + BigInt(cents(row.outstanding)), 0n).toString()) },
      ], [
        { key: 'account', label: 'Account' }, { key: 'subscriber', label: 'Subscriber' }, { key: 'status', label: 'Status' },
        { key: 'serviceAccounts', label: 'Services', align: 'right' }, { key: 'activeServices', label: 'Active', align: 'right' },
        { key: 'areas', label: 'Areas' }, { key: 'outstanding', label: 'Outstanding', align: 'right' },
      ], generatedAt);
    }
    if (request.report === 'PAYMENT_METHODS') {
      const result = await this.database.pool.query(`select method, count(*)::int transactions, sum(amount_centavos)::bigint amount from payments where status='POSTED' and payment_date >= $1::date and payment_date < $2::date + interval '1 day' group by method order by amount desc`, [request.from, request.to]);
      const rows = result.rows.map((r: Row) => ({ method: text(r.method).replaceAll('_',' '), transactions: text(r.transactions), amount: money(cents(r.amount)) }));
      const total = result.rows.reduce((sum: bigint, row: Row) => sum + BigInt(cents(row.amount)), 0n);
      return this.data(request, 'Payment method summary', rows, [{ label: 'Total collected', value: money(total.toString()) }], [{key:'method',label:'Method'},{key:'transactions',label:'Payments',align:'right'},{key:'amount',label:'Amount',align:'right'}], generatedAt);
    }
    if (request.report === 'OUTSTANDING_BALANCES' || request.report === 'AR_AGING') {
      const result = await this.database.pool.query(`select i.invoice_number, s.account_number, ${displayNameSql} subscriber, sa.service_account_number, i.due_date::text,
        greatest(0,$1::date-i.due_date)::int days, case when i.due_date >= $1::date then 'Current' when $1::date-i.due_date <=30 then '1-30' when $1::date-i.due_date<=60 then '31-60' when $1::date-i.due_date<=90 then '61-90' else '90+' end bucket, i.balance_centavos::bigint balance
        from invoices i join subscribers s on s.id=i.subscriber_id join service_accounts sa on sa.id=i.service_account_id where i.balance_centavos>0 and i.status in ('UNPAID','PARTIALLY_PAID','OVERDUE') order by i.due_date,i.invoice_number`, [request.to]);
      const rows = result.rows.map((r: Row) => ({ invoice:text(r.invoice_number), account:text(r.account_number), subscriber:text(r.subscriber), service:text(r.service_account_number), due:text(r.due_date), age:text(r.days), bucket:text(r.bucket), balance:money(cents(r.balance)) }));
      const columns = [{key:'invoice',label:'Invoice'},{key:'account',label:'Account'},{key:'subscriber',label:'Subscriber'},{key:'service',label:'Service'},{key:'due',label:'Due date'},{key:'age',label:'Days',align:'right' as const},{key:'bucket',label:'Bucket'},{key:'balance',label:'Balance',align:'right' as const}];
      return this.data(request, request.report === 'AR_AGING' ? 'Accounts receivable aging' : 'Outstanding balances', rows, [{label:'Outstanding',value:money(result.rows.reduce((n:bigint,r:Row)=>n+BigInt(cents(r.balance)),0n).toString())}], columns, generatedAt);
    }
    if (request.report === 'SUBSCRIBER_STATEMENT') {
      const [owner, opening, result] = await Promise.all([
        this.database.pool.query(`select account_number, ${displayNameSql} subscriber from subscribers s where id=$1`, [request.subscriberId]),
        this.database.pool.query(`select coalesce(sum(debit_centavos-credit_centavos),0)::text balance from ledger_entries where subscriber_id=$1 and occurred_at < $2::date`, [request.subscriberId,request.from]),
        this.database.pool.query(`select occurred_at, reference_number, description, debit_centavos::bigint debit, credit_centavos::bigint credit from ledger_entries where subscriber_id=$1 and occurred_at >= $2::date and occurred_at < $3::date + interval '1 day' order by occurred_at,id`, [request.subscriberId,request.from,request.to]),
      ]);
      const openingBalance = BigInt(text((opening.rows[0] as Row|undefined)?.balance));
      let balance=openingBalance; const rows=result.rows.map((r:Row)=>{ balance += BigInt(cents(r.debit))-BigInt(cents(r.credit)); return {date:iso(r.occurred_at).slice(0,10),reference:text(r.reference_number),description:text(r.description),debit:BigInt(cents(r.debit))?money(cents(r.debit)):'',credit:BigInt(cents(r.credit))?money(cents(r.credit)):'',balance:money(balance.toString())}; });
      const name=text((owner.rows[0] as Row|undefined)?.subscriber); const account=text((owner.rows[0] as Row|undefined)?.account_number);
      return {...this.data(request,`Subscriber statement · ${name}`,rows,[{label:'Opening balance',value:money(openingBalance.toString())},{label:'Closing balance',value:money(balance.toString())}],[{key:'date',label:'Date'},{key:'reference',label:'Reference'},{key:'description',label:'Description'},{key:'debit',label:'Debit',align:'right'},{key:'credit',label:'Credit',align:'right'},{key:'balance',label:'Running balance',align:'right'}],generatedAt),subtitle:`${account} · ${request.from} to ${request.to}`};
    }
    if (request.report === 'USER_ACTIVITY') {
      const result = await this.database.pool.query(`select al.created_at,coalesce(u.display_name,u.username,'System') actor,al.action,al.entity_type,al.entity_id,al.reason,al.request_id
        from audit_logs al left join users u on u.id=al.actor_user_id
        where al.created_at >= $1::date and al.created_at < $2::date + interval '1 day'
        order by al.created_at desc,al.id desc`, [request.from, request.to]);
      const rows = result.rows.map((row: Row) => ({ timestamp: iso(row.created_at), actor: text(row.actor), action: text(row.action), entity: text(row.entity_type), entityId: text(row.entity_id), reason: text(row.reason), requestId: text(row.request_id) }));
      return this.data(request, 'User activity and audit report', rows, [{ label: 'Activity records', value: String(rows.length) }], [
        { key: 'timestamp', label: 'Date and time' }, { key: 'actor', label: 'User' }, { key: 'action', label: 'Action' },
        { key: 'entity', label: 'Record type' }, { key: 'entityId', label: 'Record ID' }, { key: 'reason', label: 'Reason' }, { key: 'requestId', label: 'Request ID' },
      ], generatedAt);
    }
    if (request.report === 'BILLING_ADJUSTMENTS') {
      const result = await this.database.pool.query(`select a.created_at,a.id,a.amount_centavos::text amount,a.line_type::text line_type,a.reason,a.status::text status,
          i.invoice_number,s.account_number,${displayNameSql} subscriber,requested.display_name requested_by,approved.display_name approved_by,a.approved_at
        from adjustments a join invoices i on i.id=a.invoice_id join subscribers s on s.id=i.subscriber_id
        left join users requested on requested.id=a.requested_by_user_id left join users approved on approved.id=a.approved_by_user_id
        where a.created_at >= $1::date and a.created_at < $2::date + interval '1 day'
        order by a.created_at desc,a.id desc`, [request.from, request.to]);
      const rows = result.rows.map((row: Row) => ({ date: iso(row.created_at).slice(0, 10), invoice: text(row.invoice_number), account: text(row.account_number), subscriber: text(row.subscriber), type: text(row.line_type).replaceAll('_', ' '), amount: money(cents(row.amount)), status: text(row.status), reason: text(row.reason), requestedBy: text(row.requested_by), approvedBy: text(row.approved_by), approvedAt: row.approved_at ? iso(row.approved_at) : '' }));
      const postedTotal = result.rows.reduce((sum: bigint, row: Row) => row.status === 'POSTED' ? sum + BigInt(cents(row.amount)) : sum, 0n);
      return this.data(request, 'Billing adjustment report', rows, [{ label: 'Adjustment records', value: String(rows.length) }, { label: 'Posted adjustment total', value: money(postedTotal.toString()) }], [
        { key: 'date', label: 'Requested' }, { key: 'invoice', label: 'Invoice' }, { key: 'account', label: 'Account' }, { key: 'subscriber', label: 'Subscriber' },
        { key: 'type', label: 'Type' }, { key: 'amount', label: 'Amount', align: 'right' }, { key: 'status', label: 'Status' }, { key: 'reason', label: 'Reason' },
        { key: 'requestedBy', label: 'Requested by' }, { key: 'approvedBy', label: 'Approved by' }, { key: 'approvedAt', label: 'Approved at' },
      ], generatedAt);
    }
    if (request.report === 'PAYMENT_REVERSALS') {
      const result = await this.database.pool.query(`select pr.reversed_at,pr.reason,pr.id,p.payment_date,p.method::text method,p.amount_centavos::text amount,
          r.receipt_number,s.account_number,${displayNameSql} subscriber,u.display_name reversed_by
        from payment_reversals pr join payments p on p.id=pr.payment_id join receipts r on r.payment_id=p.id
        join subscribers s on s.id=p.subscriber_id join users u on u.id=pr.reversed_by_user_id
        where pr.reversed_at >= $1::date and pr.reversed_at < $2::date + interval '1 day'
        order by pr.reversed_at desc,pr.id desc`, [request.from, request.to]);
      const rows = result.rows.map((row: Row) => ({ reversedAt: iso(row.reversed_at), receipt: text(row.receipt_number), account: text(row.account_number), subscriber: text(row.subscriber), paymentDate: iso(row.payment_date), method: text(row.method).replaceAll('_', ' '), amount: money(cents(row.amount)), reason: text(row.reason), reversedBy: text(row.reversed_by) }));
      const total = result.rows.reduce((sum: bigint, row: Row) => sum + BigInt(cents(row.amount)), 0n);
      return this.data(request, 'Payment reversal report', rows, [{ label: 'Reversals', value: String(rows.length) }, { label: 'Reversed value', value: money(total.toString()) }], [
        { key: 'reversedAt', label: 'Reversed at' }, { key: 'receipt', label: 'Receipt' }, { key: 'account', label: 'Account' }, { key: 'subscriber', label: 'Subscriber' },
        { key: 'paymentDate', label: 'Original payment' }, { key: 'method', label: 'Method' }, { key: 'amount', label: 'Amount', align: 'right' }, { key: 'reason', label: 'Reason' }, { key: 'reversedBy', label: 'Reversed by' },
      ], generatedAt);
    }
    if (request.report === 'VOIDED_RECEIPTS') {
      const result = await this.database.pool.query(`select r.voided_at,r.receipt_number,r.void_reason,p.method::text method,p.payment_date,p.amount_centavos::text amount,
          s.account_number,${displayNameSql} subscriber,u.display_name voided_by
        from receipts r join payments p on p.id=r.payment_id join subscribers s on s.id=p.subscriber_id
        left join users u on u.id=r.voided_by_user_id
        where r.status='VOID' and r.voided_at >= $1::date and r.voided_at < $2::date + interval '1 day'
        order by r.voided_at desc,r.id desc`, [request.from, request.to]);
      const rows = result.rows.map((row: Row) => ({ voidedAt: iso(row.voided_at), receipt: text(row.receipt_number), account: text(row.account_number), subscriber: text(row.subscriber), paymentDate: iso(row.payment_date), method: text(row.method).replaceAll('_', ' '), amount: money(cents(row.amount)), reason: text(row.void_reason), voidedBy: text(row.voided_by) }));
      const total = result.rows.reduce((sum: bigint, row: Row) => sum + BigInt(cents(row.amount)), 0n);
      return this.data(request, 'Voided receipt report', rows, [{ label: 'Voided receipts', value: String(rows.length) }, { label: 'Voided receipt value', value: money(total.toString()) }], [
        { key: 'voidedAt', label: 'Voided at' }, { key: 'receipt', label: 'Receipt' }, { key: 'account', label: 'Account' }, { key: 'subscriber', label: 'Subscriber' },
        { key: 'paymentDate', label: 'Original payment' }, { key: 'method', label: 'Method' }, { key: 'amount', label: 'Amount', align: 'right' }, { key: 'reason', label: 'Void reason' }, { key: 'voidedBy', label: 'Voided by' },
      ], generatedAt);
    }
    if (request.report === 'COLLECTOR_ASSIGNMENTS') {
      const values: unknown[] = [request.from, request.to];
      let collectorFilter = '';
      if (request.collectorId) { values.push(request.collectorId); collectorFilter = ` and ca.collector_id=$${values.length}`; }
      const result = await this.database.pool.query(`select c.collector_number, c.name collector, s.account_number, ${displayNameSql} subscriber, sa.service_account_number, area.name area, ca.effective_from::text effective_from, ca.effective_to::text effective_to from collector_assignments ca join collectors c on c.id=ca.collector_id join service_accounts sa on sa.id=ca.service_account_id join subscribers s on s.id=sa.subscriber_id left join collection_areas area on area.id=sa.collection_area_id where ca.effective_from <= $2::date and (ca.effective_to is null or ca.effective_to >= $1::date)${collectorFilter} order by c.collector_number, s.account_number, ca.effective_from`, values);
      const rows = result.rows.map((r: Row) => ({ collectorNumber: text(r.collector_number), collector: text(r.collector), subscriberAccount: text(r.account_number), subscriber: text(r.subscriber), serviceAccount: text(r.service_account_number), area: text(r.area), effectiveFrom: text(r.effective_from), effectiveTo: text(r.effective_to) || 'Current' }));
      return this.data(request, 'Collector assignment history', rows, [{ label: 'Assignments', value: String(rows.length) }], [
        { key: 'collectorNumber', label: 'Collector ID' }, { key: 'collector', label: 'Collector' }, { key: 'subscriberAccount', label: 'Subscriber account' },
        { key: 'subscriber', label: 'Subscriber' }, { key: 'serviceAccount', label: 'Service account' }, { key: 'area', label: 'Area' },
        { key: 'effectiveFrom', label: 'Effective from' }, { key: 'effectiveTo', label: 'Effective to' },
      ], generatedAt);
    }
    const values: unknown[]=[request.from,request.to]; let collectorFilter=''; if(request.collectorId){values.push(request.collectorId);collectorFilter=` and cb.collector_id=$${values.length}`;}
    const result=await this.database.pool.query(`select cb.batch_number,cb.collection_date::text,c.name collector,ca.name area,cb.status,cr.expected_cash_centavos::bigint expected,cr.remitted_cash_centavos::bigint remitted,cr.difference_centavos::bigint difference,cr.non_cash_centavos::bigint noncash,coalesce(rollup.assigned,0)::int assigned,coalesce(rollup.collected,0)::int collected,coalesce(rollup.uncollected,0)::int uncollected,coalesce(rollup.amount,0)::bigint collected_amount from collection_batches cb join collectors c on c.id=cb.collector_id join collection_areas ca on ca.id=cb.collection_area_id left join collector_remittances cr on cr.batch_id=cb.id left join lateral (select count(*)::int assigned,count(*) filter (where a.payment_id is not null)::int collected,count(*) filter (where a.payment_id is null)::int uncollected,coalesce(sum(p.amount_centavos),0)::bigint amount from collection_batch_accounts a left join payments p on p.id=a.payment_id where a.batch_id=cb.id) rollup on true where cb.collection_date between $1::date and $2::date${collectorFilter} order by cb.collection_date desc,cb.batch_number`,values);
    const rows=result.rows.map((r:Row)=>({batch:text(r.batch_number),date:text(r.collection_date),collector:text(r.collector),area:text(r.area),status:text(r.status),expected:money(cents(r.expected)),remitted:money(cents(r.remitted)),difference:money(cents(r.difference)),noncash:money(cents(r.noncash)),assignedAccounts:text(r.assigned),collectedAccounts:text(r.collected),uncollectedAccounts:text(r.uncollected),collectedAmount:money(cents(r.collected_amount))}));
    const totals = result.rows.reduce((sum, row: Row) => ({ assigned: sum.assigned + Number(row.assigned), collected: sum.collected + Number(row.collected), uncollected: sum.uncollected + Number(row.uncollected), amount: sum.amount + BigInt(cents(row.collected_amount)) }), { assigned: 0, collected: 0, uncollected: 0, amount: 0n });
    return this.data(request,'Collector remittance and performance',rows,[{label:'Assigned accounts',value:String(totals.assigned)},{label:'Collected accounts',value:String(totals.collected)},{label:'Uncollected accounts',value:String(totals.uncollected)},{label:'Collected amount',value:money(totals.amount.toString())}],[{key:'batch',label:'Batch'},{key:'date',label:'Date'},{key:'collector',label:'Collector'},{key:'area',label:'Area'},{key:'status',label:'Status'},{key:'assignedAccounts',label:'Assigned'},{key:'collectedAccounts',label:'Collected'},{key:'uncollectedAccounts',label:'Uncollected'},{key:'collectedAmount',label:'Collected amount',align:'right'},{key:'expected',label:'Expected Cash',align:'right'},{key:'remitted',label:'Remitted Cash',align:'right'},{key:'difference',label:'Shortage / overage',align:'right'},{key:'noncash',label:'Non-cash',align:'right'}],generatedAt);
  }

  async history(subscriberId: string): Promise<ServiceHistory> {
    const result=await this.database.pool.query(`select sr.id,sa.service_account_number,'SUSPENSION' type,sr.status::text status,sr.effective_date::text occurred_on,sr.reason,sr.notes,null::bigint fee from suspension_records sr join service_accounts sa on sa.id=sr.service_account_id where sa.subscriber_id=$1 union all select rr.id,sa.service_account_number,'RECONNECTION',rr.status::text,coalesce(rr.completed_at::date,rr.scheduled_date,rr.requested_at::date)::text,null,rr.notes,rr.fee_centavos from reconnection_records rr join service_accounts sa on sa.id=rr.service_account_id where sa.subscriber_id=$1 order by occurred_on desc`,[subscriberId]);
    return {subscriberId,events:result.rows.map((r:Row)=>({id:text(r.id),serviceAccountNumber:text(r.service_account_number),type:text(r.type) as 'SUSPENSION'|'RECONNECTION',status:text(r.status),occurredOn:text(r.occurred_on),reason:r.reason===null?null:text(r.reason),notes:r.notes===null?null:text(r.notes),feeCentavos:r.fee===null?null:cents(r.fee)}))};
  }

  async export(data: ReportData, format: 'PDF'|'XLSX'): Promise<Buffer> {
    if(format==='XLSX'){
      const workbook=new ExcelJS.Workbook(); workbook.creator='BCIS'; workbook.created=new Date(data.generatedAt);
      const sheet=workbook.addWorksheet(data.title.slice(0,31),{pageSetup:{orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0}});
      sheet.addRow([data.title]); sheet.mergeCells(1,1,1,Math.max(1,data.columns.length)); sheet.getCell('A1').font={bold:true,size:18,color:{argb:'FF12325A'}};
      sheet.addRow([data.subtitle]); sheet.mergeCells(2,1,2,Math.max(1,data.columns.length)); sheet.addRow([]);
      const header=sheet.addRow(data.columns.map(c=>c.label)); header.font={bold:true,color:{argb:'FFFFFFFF'}}; header.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1E5AA8'}};
      data.rows.forEach(row=>sheet.addRow(data.columns.map(c=>row[c.key]??''))); data.totals.forEach(total=>sheet.addRow([total.label,total.value]));
      sheet.views=[{state:'frozen',ySplit:4}]; sheet.columns.forEach(column=>{column.width=18;}); sheet.autoFilter={from:{row:4,column:1},to:{row:4,column:Math.max(1,data.columns.length)}};
      return Buffer.from(await workbook.xlsx.writeBuffer());
    }
    const fontDir=join(dirname(createRequire(import.meta.url).resolve('pdfmake')),'..','fonts','Roboto');
    pdfmake.setFonts({Roboto:{normal:join(fontDir,'Roboto-Regular.ttf'),bold:join(fontDir,'Roboto-Medium.ttf'),italics:join(fontDir,'Roboto-Italic.ttf'),bolditalics:join(fontDir,'Roboto-MediumItalic.ttf')}});
    pdfmake.setUrlAccessPolicy(()=>false); pdfmake.setLocalAccessPolicy(path=>path.startsWith(fontDir));
    const body=[data.columns.map(c=>({text:c.label,bold:true,color:'#ffffff',fillColor:'#1e5aa8'})),...data.rows.map(row=>data.columns.map(c=>({text:row[c.key]??'',alignment:c.align??'left'})))];
    const document={pageOrientation:'landscape',pageMargins:[28,36,28,36],defaultStyle:{font:'Roboto',fontSize:8,color:'#18324f'},content:[{text:data.title,fontSize:17,bold:true,color:'#12325a'},{text:data.subtitle,fontSize:9,color:'#5d7188',margin:[0,3,0,14]},{table:{headerRows:1,widths:data.columns.map(()=>'*'),body},layout:'lightHorizontalLines'},{columns:data.totals.map(t=>({text:`${t.label}: ${t.value}`,bold:true,margin:[0,12,12,0]}))}],footer:(page:number,pages:number)=>({text:`BCIS · Page ${page} of ${pages}`,alignment:'center',fontSize:7,color:'#718096'})};
    return pdfmake.createPdf(document).getBuffer();
  }

  private data(request:ReportRequest,title:string,rows:Record<string,string>[],totals:{label:string;value:string}[],columns:{key:string;label:string;align?:'left'|'right'}[],generatedAt:string):ReportData{return{report:request.report,title,subtitle:`${request.from} to ${request.to}`,generatedAt,columns:columns.map(c=>({...c,align:c.align??'left'})),rows,totals};}
}
