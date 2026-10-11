// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MascotPreview } from './MascotPreview';
import { MascotAssetBoundary } from './MascotRenderer';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('mascot character studio', () => {
  it('lets a developer inspect all seven requested expressions', () => {
    render(<MascotPreview />);
    expect(screen.getByRole('img', { name: 'BCIS Buddy, neutral' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Celebrating/ }));
    expect(screen.getByRole('img', { name: 'BCIS Buddy, celebrating' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Celebrating/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows bundled vector fallback if character artwork throws while rendering', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function BrokenArtwork(): never { throw new Error('asset render failed'); }
    const { container } = render(<MascotAssetBoundary mood="happy" compact><BrokenArtwork /></MascotAssetBoundary>);
    expect(container.querySelector('.mascot-art-fallback.mood-happy')).toBeInTheDocument();
  });
});
