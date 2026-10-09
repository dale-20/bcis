/* eslint-disable react-hooks/incompatible-library -- TanStack Table is the required headless table engine; React Compiler safely leaves this component unmemoized. */
import { flexRender, getCoreRowModel, useReactTable, type ColumnDef } from '@tanstack/react-table';
import { ChevronDown, ChevronUp, ChevronsUpDown, Inbox } from 'lucide-react';
import type { SubscriberListItem, SubscriberListResponse } from './types';

interface Props {
  data: SubscriberListResponse;
  sort: 'name' | 'account' | 'updated';
  direction: 'asc' | 'desc';
  onSort: (sort: 'name' | 'account' | 'updated') => void;
  onSelect: (id: string) => void;
}

function SortIcon({ active, direction }: { active: boolean; direction: 'asc' | 'desc' }) {
  if (!active) return <ChevronsUpDown aria-hidden="true" />;
  return direction === 'asc' ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />;
}

export function SubscriberTable({ data, sort, direction, onSort, onSelect }: Props) {
  const columns: ColumnDef<SubscriberListItem>[] = [
    { accessorKey: 'accountNumber', header: () => <button className="table-sort" onClick={() => onSort('account')}>Account <SortIcon active={sort === 'account'} direction={direction} /></button> },
    { accessorKey: 'displayName', header: () => <button className="table-sort" onClick={() => onSort('name')}>Subscriber <SortIcon active={sort === 'name'} direction={direction} /></button>, cell: ({ row }) => <div className="subscriber-cell"><strong>{row.original.displayName}</strong><span>{row.original.primaryContact ?? 'No contact recorded'}</span></div> },
    { accessorKey: 'primaryAddress', header: 'Primary address', cell: ({ getValue }) => <span className="table-secondary">{String(getValue() ?? 'No address recorded')}</span> },
    { accessorKey: 'serviceCount', header: 'Services', cell: ({ row }) => <span className="service-count"><strong>{row.original.activeServiceCount}</strong> active · {row.original.serviceCount} total</span> },
    { accessorKey: 'status', header: 'Status', cell: ({ getValue }) => <span className={`status-badge status-${String(getValue()).toLowerCase()}`}>{String(getValue()).replace('_', ' ')}</span> },
  ];
  const table = useReactTable({ data: data.items, columns, getCoreRowModel: getCoreRowModel(), manualPagination: true, rowCount: data.total });

  if (data.items.length === 0) return <div className="empty-state"><Inbox aria-hidden="true" /><h3>No subscribers found</h3><p>Adjust the search or status filter, or create a new subscriber.</p></div>;
  return <div className="table-scroll"><table className="data-table"><thead>{table.getHeaderGroups().map((group) => <tr key={group.id}>{group.headers.map((header) => <th key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</th>)}</tr>)}</thead><tbody>{table.getRowModel().rows.map((row) => <tr key={row.id} onClick={() => onSelect(row.original.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelect(row.original.id); }} tabIndex={0} aria-label={`Open ${row.original.displayName}`}>
    {row.getVisibleCells().map((cell) => <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}
  </tr>)}</tbody></table></div>;
}

