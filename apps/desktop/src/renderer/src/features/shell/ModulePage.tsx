import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, Clock3 } from 'lucide-react';

export function ModulePage({
  title,
  description,
  icon: Icon,
  capabilities,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  capabilities: readonly string[];
}) {
  return <div className="content-enter module-page">
    <header className="page-heading">
      <span className="eyebrow">Authorized workspace</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
    <section className="module-ready" aria-labelledby="module-ready-title">
      <div className="module-ready-icon"><Icon aria-hidden="true" /></div>
      <div className="module-ready-copy">
        <span className="status-badge status-pending"><Clock3 aria-hidden="true" /> Workflow setup</span>
        <h2 id="module-ready-title">This workspace is ready for its verified workflow.</h2>
        <p>The navigation and permission boundary are active. Operational controls will appear here as each server-backed increment passes its tests.</p>
      </div>
      <ul aria-label={`${title} planned capabilities`}>
        {capabilities.map((capability) => <li key={capability}><CheckCircle2 aria-hidden="true" /><span>{capability}</span></li>)}
      </ul>
    </section>
  </div>;
}
