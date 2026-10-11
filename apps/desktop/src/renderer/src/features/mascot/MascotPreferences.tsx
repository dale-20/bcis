import { Volume2, VolumeX, X } from 'lucide-react';
import type { MascotPreferences as MascotPreferencesState } from './mascot-preferences';

export function MascotPreferences({ preferences, reducedMotion, onToggleSound, onTip, onHide, onClose }: {
  preferences: MascotPreferencesState;
  reducedMotion: boolean;
  onToggleSound: () => void;
  onTip: () => void;
  onHide: () => void;
  onClose: () => void;
}) {
  return <section id="bcis-mascot-preferences" className="mascot-preferences" aria-label="BCIS Buddy preferences">
    <header><strong>Buddy settings</strong><button aria-label="Close preferences" onClick={onClose}><X aria-hidden="true" /></button></header>
    <div className="mascot-sound-setting"><span>Sound feedback</span><button aria-label={preferences.soundEnabled ? 'Disable sound feedback' : 'Enable sound feedback'} aria-pressed={preferences.soundEnabled} onClick={onToggleSound}>
      {preferences.soundEnabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}{preferences.soundEnabled ? 'On' : 'Off'}
    </button></div>
    <p>Sound starts off. Reduced motion follows your Windows setting: {reducedMotion ? 'on' : 'off'}.</p>
    <button className="mascot-tip" onClick={onTip}>What can Buddy do?</button>
    <button className="mascot-hide" onClick={onHide}>Minimize Buddy</button>
  </section>;
}
