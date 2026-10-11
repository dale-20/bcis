import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter, useLocation } from 'react-router-dom';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import './styles.css';
import './features/mascot/mascot.css';
import { App } from './App';
import { MascotPreview } from './features/mascot/MascotPreview';
import { DesktopServiceError, SESSION_INVALID_EVENT } from './services/api';

const reportSessionFailure = (error: Error) => {
  if (error instanceof DesktopServiceError && error.code === 'SESSION_INVALID') window.dispatchEvent(new Event(SESSION_INVALID_EVENT));
};
const client = new QueryClient({
  queryCache: new QueryCache({ onError: reportSessionFailure }),
  mutationCache: new MutationCache({ onError: reportSessionFailure }),
  defaultOptions: { queries: { retry: 1, staleTime: 5000, refetchOnWindowFocus: true } },
});
const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');

function AppEntry() {
  const location = useLocation();
  if (import.meta.env.DEV && location.pathname === '/mascot-preview') return <MascotPreview />;
  return <App />;
}

createRoot(root).render(<StrictMode><QueryClientProvider client={client}><HashRouter><AppEntry /></HashRouter></QueryClientProvider></StrictMode>);
