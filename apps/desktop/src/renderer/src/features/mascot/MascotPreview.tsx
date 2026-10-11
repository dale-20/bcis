import { useState } from 'react';
import { MascotRenderer } from './MascotRenderer';
import type { MascotMood } from './mascot-model';
import './mascot-preview.css';

const poses = [
  { mood: 'neutral', label: 'Neutral', note: 'Quiet default expression' },
  { mood: 'happy', label: 'Happy', note: 'Warm smile and relaxed eyes' },
  { mood: 'thinking', label: 'Thinking', note: 'Head tilt and question cue' },
  { mood: 'surprised', label: 'Surprised', note: 'Wide eyes and open mouth' },
  { mood: 'concerned', label: 'Concerned', note: 'Soft worried brows and mouth' },
  { mood: 'sleepy', label: 'Sleepy', note: 'Lowered eyelids and calm pose' },
  { mood: 'celebrating', label: 'Celebrating', note: 'Raised arms and joyful bounce' },
] as const satisfies readonly { mood: MascotMood; label: string; note: string }[];

export function MascotPreview() {
  const [selected, setSelected] = useState<MascotMood>('neutral');
  const current = poses.find((pose) => pose.mood === selected) ?? poses[0];
  return <main className="mascot-preview">
    <header className="mascot-preview-header"><div className="mascot-preview-brand"><span aria-hidden="true">⌁</span><div><strong>BCIS Buddy</strong><small>Character studio · Phase 2</small></div></div><span className="mascot-preview-badge">LOCAL VECTOR ART</span></header>
    <section className="mascot-preview-stage" aria-label="Selected character preview">
      <div className="mascot-preview-copy"><p className="mascot-preview-eyebrow">CHARACTER STATES</p><h1>Meet your office companion.</h1><p>One consistent character, with expression and motion tuned to each moment in BCIS.</p><div className="mascot-preview-selected"><span className="mascot-preview-dot" /><strong>{current.label}</strong><span>{current.note}</span></div></div>
      <div className="mascot-preview-hero"><MascotRenderer mood={selected} /><span className="mascot-preview-ground" /></div>
    </section>
    <section className="mascot-pose-list" aria-label="Choose a Buddy expression">
      {poses.map((pose) => <button key={pose.mood} type="button" className={selected === pose.mood ? 'is-selected' : ''} aria-pressed={selected === pose.mood} onClick={() => setSelected(pose.mood)}><span className="mascot-pose-thumbnail"><MascotRenderer mood={pose.mood} compact /></span><span className="mascot-pose-label">{pose.label}</span></button>)}
    </section>
    <footer className="mascot-preview-footer"><span>Layered SVG · no network assets · reduced-motion aware</span><span>Use <kbd>Tab</kbd> and <kbd>Enter</kbd> to inspect poses</span></footer>
  </main>;
}
