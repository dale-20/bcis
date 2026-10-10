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
const money = (value: string) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(BigInt(value)) / 100);
const displayNameSql = "coalesce(s.organization_name, concat_ws(' ', s.first_name, s.last_name))";

export class ReportService {
  constructor(private readonly database: Database) {}

  async dashboard(query: DashboardQuery): Promise<Dashboard> {
    const args = [query.from, query.to];
    const [summary, monthly, methods, aging, recent] = await Promise.all([
      this.database.pool.query(`select
        coalesce((select sum(amount_centavos) from payments where status='POSTED' and payment_date >= $1::date and payment_date < $2::date + interval '1 day'),0)::bigint collected,
        (select count(*) from payments where status='POSTED' and payment_date >= $1::date and payment_date < $2::date + interval '1 day')::int payment_count,
        coalesce((select sum(balance_centavos) from invoices where balance_centavos > 0 and status in ('UNPAID','PARTIALLY_PAID','OVERDUE')),0)::bigint outstanding,
        coalesce((select sum(balance_centavos) from invoices where balance_centavos > 0 and due_date < current_date and status in ('UNPAID','PARTIALLY_PAID','OVERDUE')),0)::bigint overdue,
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
    ]);
    const s = summary.rows[0] as Row; const a = aging.rows[0] as Row;
    return {
      range: query, collectedCentavos: cents(s.collected), outstandingCentavos: cents(s.outstanding), overdueCentavos: cents(s.overdue),
      activeSubscribers: Number(s.active_subscribers), postedPaymentCount: Number(s.payment_count),
      monthlyCollections: monthly.rows.map((r: Row) => ({ month: text(r.collection_month), amountCentavos: cents(r.amount), count: Number(r.count) })),
      paymentMethods: methods.rows.map((r: Row) => ({ method: text(r.method), amountCentavos: cents(r.amount), count: Number(r.count) })),
      aging: { CURRENT: cents(a.current_amount), '1_30': cents(a.b1), '31_60': cents(a.b2), '61_90': cents(a.b3), '90_PLUS': cents(a.b4) },
      recentPayments: recent.rows.map((r: Row) => ({ id: text(r.id), receiptNumber: text(r.receipt_number), subscriberName: text(r.subscriber_name), method: text(r.method), amountCentavos: cents(r.amount), paymentDate: iso(r.payment_date) })),
    };
  }

  async report(request: ReportRequest): Promise<ReportData> {
    const generatedAt = new Date().toISOString();
    if (request.report === 'MONTHLY_COLLECTIONS') {
      const result = await this.database.pool.query(`select to_char(date_trunc('month',payment_date),'Mon YYYY') period, count(*)::int transactions, sum(amount_centavos)::bigint amount from payments where status='POSTED' and payment_date >= $1::date and payment_date < $2::date + interval '1 day' group by date_trunc('month',payment_date) order by date_trunc('month',payment_date)`, [request.from, request.to]);
      const rows = result.rows.map((r: Row) => ({ period: text(r.period), transactions: text(r.transactions), amount: money(cents(r.amount)) }));
      return this.data(request, 'Monthly collections', rows, [{ label: 'Total collected', value: money(result.rows.reduce((n: bigint, r: Row) => n + BigInt(cents(r.amount)), 0n).toString()) }], [{key:'period',label:'Month'},{key:'transactions',label:'Payments',align:'right'},{key:'amount',label:'Collected',align:'right'}], generatedAt);
    }
    if (request.report === 'PAYMENT_METHODS') {
      const result = await this.database.pool.query(`select method, count(*)::int transactions, sum(amount_centavos)::bigint amount from payments where status='POSTED' and payment_date >= $1::date and payment_date < $2::date + interval '1 day' group by method order by amount desc`, [request.from, request.to]);
      const rows = result.rows.map((r: Row) => ({ method: text(r.method).replaceAll('_',' '), transactions: text(r.transactions), amount: money(cents(r.amount)) }));
      return this.data(request, 'Payment method summary', rows, [], [{key:'method',label:'Method'},{key:'transactions',label:'Payments',align:'right'},{key:'amount',label:'Amount',align:'right'}], generatedAt);
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
      const owner = await this.database.pool.query(`select account_number, ${displayNameSql} subscriber from subscribers s where id=$1`, [request.subscriberId]);
      const result = await this.database.pool.query(`select occurred_at, reference_number, description, debit_centavos::bigint debit, credit_centavos::bigint credit from ledger_entries where subscriber_id=$1 and occurred_at >= $2::date and occurred_at < $3::date + interval '1 day' order by occurred_at,id`, [request.subscriberId,request.from,request.to]);
      let balance=0n; const rows=result.rows.map((r:Row)=>{ balance += BigInt(cents(r.debit))-BigInt(cents(r.credit)); return {date:iso(r.occurred_at).slice(0,10),reference:text(r.reference_number),description:text(r.description),debit:BigInt(cents(r.debit))?money(cents(r.debit)):'',credit:BigInt(cents(r.credit))?money(cents(r.credit)):'',balance:money(balance.toString())}; });
      const name=text((owner.rows[0] as Row|undefined)?.subscriber); const account=text((owner.rows[0] as Row|undefined)?.account_number);
      return {...this.data(request,`Subscriber statement · ${name}`,rows,[{label:'Closing movement',value:money(balance.toString())}],[{key:'date',label:'Date'},{key:'reference',label:'Reference'},{key:'description',label:'Description'},{key:'debit',label:'Debit',align:'right'},{key:'credit',label:'Credit',align:'right'},{key:'balance',label:'Running balance',align:'right'}],generatedAt),subtitle:`${account} · ${request.from} to ${request.to}`};
    }
    const values: unknown[]=[request.from,request.to]; let collectorFilter=''; if(request.collectorId){values.push(request.collectorId);collectorFilter=` and cb.collector_id=$${values.length}`;}
    const result=await this.database.pool.query(`select cb.batch_number,cb.collection_date::text,c.name collector,ca.name area,cb.status,cr.expected_cash_centavos::bigint expected,cr.remitted_cash_centavos::bigint remitted,cr.difference_centavos::bigint difference,cr.non_cash_centavos::bigint noncash from collection_batches cb join collectors c on c.id=cb.collector_id join collection_areas ca on ca.id=cb.collection_area_id left join collector_remittances cr on cr.batch_id=cb.id where cb.collection_date between $1::date and $2::date${collectorFilter} order by cb.collection_date desc,cb.batch_number`,values);
    const rows=result.rows.map((r:Row)=>({batch:text(r.batch_number),date:text(r.collection_date),collector:text(r.collector),area:text(r.area),status:text(r.status),expected:money(cents(r.expected)),remitted:money(cents(r.remitted)),difference:money(cents(r.difference)),noncash:money(cents(r.noncash))}));
    return this.data(request,'Collector remittance reconciliation',rows,[],[{key:'batch',label:'Batch'},{key:'date',label:'Date'},{key:'collector',label:'Collector'},{key:'area',label:'Area'},{key:'status',label:'Status'},{key:'expected',label:'Expected',align:'right'},{key:'remitted',label:'Remitted',align:'right'},{key:'difference',label:'Variance',align:'right'},{key:'noncash',label:'Non-cash',align:'right'}],generatedAt);
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
