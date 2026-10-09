import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus, Search, Users } from 'lucide-react';
import type { AuthenticatedUser, SubscriberCreate } from '@bcis/shared';
import { Button } from '../../components/ui/button';
import { createSubscriber, getReferenceData, listSubscribers } from '../../services/api';
import { SubscriberForm } from './SubscriberForm';
import { SubscriberProfile } from './SubscriberProfile';
import { SubscriberTable } from './SubscriberTable';

type Sort = 'name' | 'account' | 'updated';
type Direction = 'asc' | 'desc';

function useDebouncedValue(value: string, delay: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

export function SubscribersPage({ user }: { user: AuthenticatedUser }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 250);
  const [status, setStatus] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'TERMINATED' | 'ARCHIVED'>('ALL');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>('name');
  const [direction, setDirection] = useState<Direction>('asc');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const canManage = user.permissions.includes('subscriber.manage');

  const listQuery = useQuery({
    queryKey: ['subscribers', { query: debouncedSearch, status, page, sort, direction }],
    queryFn: () => listSubscribers({ query: debouncedSearch, status, page, pageSize: 20, sort, direction }),
    placeholderData: keepPreviousData,
  });
  const referenceQuery = useQuery({ queryKey: ['subscriber-reference-data'], queryFn: getReferenceData, enabled: creating, staleTime: 300_000 });
  const createMutation = useMutation({
    mutationFn: (input: SubscriberCreate) => createSubscriber(input),
    onSuccess: async (subscriber) => {
      await queryClient.invalidateQueries({ queryKey: ['subscribers'] });
      queryClient.setQueryData(['subscriber', subscriber.id], subscriber);
      setCreating(false);
      setSelectedId(subscriber.id);
    },
  });

  if (selectedId) return <SubscriberProfile id={selectedId} onBack={() => setSelectedId(null)} />;
  if (creating) {
    if (referenceQuery.isPending) return <section className="page-state"><div className="skeleton form-skeleton" /><p>Loading plans and collection routes…</p></section>;
    if (referenceQuery.isError) return <section className="page-state error-state"><h2>Setup data unavailable</h2><p>{referenceQuery.error.message}</p><Button variant="outline" onClick={() => { void referenceQuery.refetch(); }}>Try again</Button></section>;
    return <SubscriberForm references={referenceQuery.data} pending={createMutation.isPending} serverError={createMutation.error?.message ?? null} onCancel={() => { setCreating(false); createMutation.reset(); }} onSubmit={async (input) => { await createMutation.mutateAsync(input); }} />;
  }

  const handleSort = (next: Sort) => {
    if (sort === next) setDirection((value) => value === 'asc' ? 'desc' : 'asc');
    else { setSort(next); setDirection('asc'); }
    setPage(1);
  };

  return <div className="content-enter">
    <header className="page-heading page-heading-actions"><div><h1>Subscribers</h1><p>Search customer identities, addresses, contacts, and service accounts.</p></div>{canManage && <Button onClick={() => setCreating(true)}><Plus aria-hidden="true" /> New subscriber</Button>}</header>
    <section className="list-surface" aria-label="Subscriber directory">
      <div className="list-toolbar">
        <label className="search-field"><Search aria-hidden="true" /><span className="sr-only">Search subscribers</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search name, account, contact, address, or service…" /></label>
        <label className="filter-field"><span>Status</span><select value={status} onChange={(event) => { setStatus(event.target.value as typeof status); setPage(1); }}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="SUSPENDED">Suspended</option><option value="TERMINATED">Terminated</option><option value="ARCHIVED">Archived</option></select></label>
      </div>
      {listQuery.isPending ? <div className="table-loading" aria-live="polite"><div className="skeleton table-skeleton" /><p>Loading subscribers…</p></div>
        : listQuery.isError ? <div className="empty-state error-state"><Users aria-hidden="true" /><h3>Subscriber directory unavailable</h3><p>{listQuery.error.message}</p><Button variant="outline" onClick={() => { void listQuery.refetch(); }}>Try again</Button></div>
        : <><SubscriberTable data={listQuery.data} sort={sort} direction={direction} onSort={handleSort} onSelect={setSelectedId} />
          <footer className="pagination"><p>{listQuery.data.total === 0 ? 'No records' : `${(page - 1) * listQuery.data.pageSize + 1}–${Math.min(page * listQuery.data.pageSize, listQuery.data.total)} of ${listQuery.data.total} subscribers`}{listQuery.isFetching && <span> · Updating…</span>}</p><div><Button variant="outline" size="sm" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}><ChevronLeft aria-hidden="true" /> Previous</Button><span>Page {page} of {Math.max(1, listQuery.data.pageCount)}</span><Button variant="outline" size="sm" onClick={() => setPage((value) => value + 1)} disabled={page >= listQuery.data.pageCount}>Next <ChevronRight aria-hidden="true" /></Button></div></footer></>}
    </section>
  </div>;
}

