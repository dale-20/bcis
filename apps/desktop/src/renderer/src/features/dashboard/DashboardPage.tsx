import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, Banknote, CalendarRange, CircleDollarSign, Clock3, ReceiptText, Users } from 'lucide-react';
import { PageError, PageLoading } from '../../components/PageFeedback';
import { getDashboard } from '../../services/api';

const peso = (value: string) => new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 0 }).format(Number(BigInt(value)) / 100);
const today = new Date();
const range = { from: `${today.getFullYear()}-01-01`, to: today.toISOString().slice(0, 10) };
const month = (value: string) => new Intl.DateTimeFormat('en-PH', { month: 'short' }).format(new Date(`${value}-01T00:00:00`));

export function DashboardPage() {
  const query = useQuery({ queryKey: ['dashboard', range], queryFn: () => getDashboard(range), refetchInterval: 60_000 });
  if (query.isPending) return <PageLoading label="Loading operational dashboard..." />;
  if (query.isError) return <PageError title="Dashboard unavailable" message={query.error.message} onRetry={() => void query.refetch()} />;
  const data=query.data; const max=Math.max(1,...data.monthlyCollections.map(item=>Number(BigInt(item.amountCentavos)))); const agingTotal=Object.values(data.aging).reduce((sum,value)=>sum+BigInt(value),0n);
  return <div className="content-enter dashboard-page">
    <header className="page-heading page-heading-actions"><div><span className="eyebrow">Operational overview</span><h1>Dashboard</h1><p>Collections, exposure, and subscriber activity from live posted records.</p></div><div className="date-chip"><CalendarRange aria-hidden="true" />Year to date · {range.to}</div></header>
    <section className="metric-grid" aria-label="Key performance indicators">
      <article className="metric-card accent"><div><span>Collected YTD</span><CircleDollarSign /></div><strong>{peso(data.collectedCentavos)}</strong><small>{data.postedPaymentCount.toLocaleString()} posted payments</small></article>
      <article className="metric-card"><div><span>Outstanding</span><ReceiptText /></div><strong>{peso(data.outstandingCentavos)}</strong><small>All open invoice balances</small></article>
      <article className="metric-card warning"><div><span>Overdue</span><Clock3 /></div><strong>{peso(data.overdueCentavos)}</strong><small>Past due as of today</small></article>
      <article className="metric-card"><div><span>Active subscribers</span><Users /></div><strong>{data.activeSubscribers.toLocaleString()}</strong><small>Current active records</small></article>
    </section>
    <div className="dashboard-grid">
      <section className="insight-card collections-chart"><div className="card-title"><div><h2>Monthly collections</h2><p>Posted payments across the selected period</p></div><Banknote /></div>
        {data.monthlyCollections.length ? <div className="bar-chart" role="img" aria-label="Monthly posted collections bar chart">{data.monthlyCollections.map(item=><div className="bar-column" key={item.month}><span className="bar-value">{peso(item.amountCentavos)}</span><div className="bar-track"><span style={{height:`${Math.max(4,Number(BigInt(item.amountCentavos))/max*100)}%`}} /></div><strong>{month(item.month)}</strong></div>)}</div>:<p className="empty-inline">No posted collections in this period.</p>}
      </section>
      <section className="insight-card"><div className="card-title"><div><h2>Payment mix</h2><p>Posted value by payment method</p></div><ArrowDownRight /></div><div className="method-list">{data.paymentMethods.map(item=>{const share=data.collectedCentavos==='0'?0:Number(BigInt(item.amountCentavos)*100n/BigInt(data.collectedCentavos));return <div key={item.method}><div><strong>{item.method.replaceAll('_',' ')}</strong><span>{peso(item.amountCentavos)} · {item.count}</span></div><div className="progress-track"><span style={{width:`${share}%`}} /></div><small>{share}%</small></div>})}</div></section>
      <section className="insight-card aging-card"><div className="card-title"><div><h2>Accounts receivable aging</h2><p>Open invoice balances by age</p></div><span className="total-pill">{peso(agingTotal.toString())}</span></div><div className="aging-list">{Object.entries(data.aging).map(([key,value])=>{const share=agingTotal===0n?0:Number(BigInt(value)*100n/agingTotal);return <div key={key}><span>{key==='CURRENT'?'Current':key.replace('_','–')}</span><div className="aging-bar"><i style={{width:`${share}%`}} /></div><strong>{peso(value)}</strong></div>})}</div></section>
      <section className="insight-card recent-card"><div className="card-title"><div><h2>Recent collections</h2><p>Latest issued receipts</p></div></div><div className="dense-table-wrap"><table className="dense-table"><thead><tr><th>Receipt</th><th>Subscriber</th><th>Method</th><th>Date</th><th className="numeric">Amount</th></tr></thead><tbody>{data.recentPayments.map(payment=><tr key={payment.id}><td><strong>{payment.receiptNumber}</strong></td><td>{payment.subscriberName}</td><td><span className="method-badge">{payment.method}</span></td><td>{new Intl.DateTimeFormat('en-PH',{dateStyle:'medium'}).format(new Date(payment.paymentDate))}</td><td className="numeric"><strong>{peso(payment.amountCentavos)}</strong></td></tr>)}</tbody></table></div></section>
    </div>
  </div>;
}
