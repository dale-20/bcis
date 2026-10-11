import { useState } from 'react';
import { animationMood, MASCOT_ANIMATIONS, type MascotAnimationName } from './mascot-animation';
import { MascotRenderer } from './MascotRenderer';
import { useMascotAnimation } from './use-mascot-animation';
import './mascot-preview.css';

const animationNotes: Record<MascotAnimationName, string> = {
  idle: 'Gentle breathing, natural blinks, and a small occasional glance.',
  walk: 'Alternating feet with a coordinated arm swing and soft body bounce.',
  happy: 'Warm smile, friendly wave, and a brief celebratory bounce.',
  thinking: 'A thoughtful tilt with the glove resting near the chin.',
  processing: 'Subtle alternating arm movement while Buddy works.',
  success: 'Thumbs-up and checkmark with a short celebratory hop.',
  warning: 'Concerned brows and a quiet attention gesture.',
  error: 'A brief disappointed reaction that returns to idle.',
  sleep: 'Closed eyes, slow breathing, and a drifting sleep indicator.',
  surprised: 'Wide eyes and a quick, restrained reaction.',
  greeting: 'A clear, welcoming hand wave.',
};

const animationLabels: Record<MascotAnimationName, string> = {
  idle: 'Idle', walk: 'Walk', happy: 'Happy', thinking: 'Thinking', processing: 'Processing',
  success: 'Success', warning: 'Warning', error: 'Error', sleep: 'Sleep', surprised: 'Surprised', greeting: 'Greeting',
};

export function MascotPreview() {
  const { state, paused, play } = useMascotAnimation();
  const [reducedMotion, setReducedMotion] = useState(() => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [completedAnimation, setCompletedAnimation] = useState<MascotAnimationName | null>(null);
  const triggerAnimation = (name: MascotAnimationName) => {
    setCompletedAnimation(null);
    play({ name, priority: 100 }, (finished) => setCompletedAnimation(finished.name));
  };

  return <main className="mascot-preview">
    <header className="mascot-preview-header"><div className="mascot-preview-brand"><span aria-hidden="true">⌁</span><div><strong>BCIS Buddy</strong><small>Animation studio · Phase 3</small></div></div><label className="mascot-preview-motion"><input type="checkbox" checked={reducedMotion} onChange={(event) => setReducedMotion(event.currentTarget.checked)} /> Reduced motion</label></header>
    <section className="mascot-preview-stage" aria-label="Selected character animation">
      <div className="mascot-preview-copy"><p className="mascot-preview-eyebrow">ANIMATION PLAYGROUND</p><h1>Meet your office companion.</h1><p>Test each motion on the same layered vector character. Temporary reactions return to idle; looping poses run until you choose another.</p><div className="mascot-preview-selected"><span className="mascot-preview-dot" /><strong>{animationLabels[state.name]}</strong><span>{completedAnimation ? `${animationLabels[completedAnimation]} completed and returned to idle.` : animationNotes[state.name]}</span></div></div>
      <div className="mascot-preview-hero"><MascotRenderer mood={animationMood[state.name]} animation={state.name} paused={paused} reducedMotion={reducedMotion} key={state.requestId} /><span className="mascot-preview-ground" /></div>
    </section>
    <section className="mascot-pose-list" aria-label="Trigger a Buddy animation">
      {MASCOT_ANIMATIONS.map((animationName) => <button key={animationName} type="button" className={state.name === animationName ? 'is-selected' : ''} aria-pressed={state.name === animationName} onClick={() => triggerAnimation(animationName)}><span className="mascot-pose-thumbnail"><MascotRenderer mood={animationMood[animationName]} animation={animationName} compact reducedMotion /></span><span className="mascot-pose-label">{animationLabels[animationName]}</span></button>)}
    </section>
    <footer className="mascot-preview-footer"><span>CSS keyframes on authored SVG layers · no network assets</span><span>Use <kbd>Tab</kbd> and <kbd>Enter</kbd> to trigger</span></footer>
  </main>;
}
