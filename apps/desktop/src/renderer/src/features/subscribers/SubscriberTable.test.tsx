// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SubscriberTable } from './SubscriberTable';

describe('SubscriberTable', () => {
  it('renders server results and opens a profile from the keyboard', () => {
    const select = vi.fn();
    render(<SubscriberTable data={{
      page: 1, pageSize: 20, total: 1, pageCount: 1,
      items: [{ id: '018f70ea-7c89-7b61-bef2-4dfb1aaf33d0', accountNumber: 'BCIS-00001', displayName: 'Amihan Abad', primaryContact: '0917 555 0001', primaryAddress: '101 Mahogany Street, Casisang, Malaybalay City', status: 'ACTIVE', serviceCount: 2, activeServiceCount: 2, updatedAt: new Date().toISOString() }],
    }} sort="name" direction="asc" onSort={vi.fn()} onSelect={select} />);
    const row = screen.getByRole('row', { name: 'Open Amihan Abad' });
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(select).toHaveBeenCalledWith('018f70ea-7c89-7b61-bef2-4dfb1aaf33d0');
    expect(row.textContent).toContain('2 active · 2 total');
  });

  it('shows a useful empty state', () => {
    render(<SubscriberTable data={{ page: 1, pageSize: 20, total: 0, pageCount: 0, items: [] }} sort="name" direction="asc" onSort={vi.fn()} onSelect={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'No subscribers found' })).toBeTruthy();
  });
});

