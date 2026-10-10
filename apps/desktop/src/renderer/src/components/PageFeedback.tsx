import { AlertCircle } from 'lucide-react';
import { Button } from './ui/button';

export function PageLoading({ label }: { label: string }) {
  return <section className="page-state" aria-live="polite" aria-busy="true"><div className="skeleton page-skeleton" /><p>{label}</p></section>;
}

export function PageError({ title, message, onRetry }: { title: string; message: string; onRetry?: () => void }) {
  return <section className="page-state error-state" role="alert"><AlertCircle aria-hidden="true" /><h2>{title}</h2><p>{message}</p>{onRetry && <Button variant="outline" onClick={onRetry}>Try again</Button>}</section>;
}

