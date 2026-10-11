import { Volume2, VolumeX, X } from 'lucide-react';
import type { MascotPreferences as MascotPreferencesState } from './mascot-preferences';

export function MascotPreferences({ preferences, reducedMotion, onUpdate, onTip, onResetPosition, onClose }: {
  preferences: MascotPreferencesState;
  reducedMotion: boolean;
  onUpdate: (patch: Partial<MascotPreferencesState>) => void;
  onTip: () => void;
  onResetPosition: () => void;
  onClose: () => void;
}) {
  return <section id="bcis-mascot-preferences" className="mascot-preferences" aria-label="BCIS Buddy preferences">
    <header><strong>Buddy settings</strong><button type="button" aria-label="Close preferences" onClick={onClose}><X aria-hidden="true" /></button></header>
    <label className="mascot-setting-row"><span>Buddy enabled</span><input type="checkbox" checked={preferences.enabled} onChange={(event) => onUpdate({ enabled: event.currentTarget.checked })} /></label>
    <label className="mascot-setting-row"><span>Animations</span><input type="checkbox" checked={preferences.animationsEnabled} onChange={(event) => onUpdate({ animationsEnabled: event.currentTarget.checked })} /></label>
    <div className="mascot-setting-row"><span>Sound feedback</span><button type="button" aria-label={preferences.soundEnabled ? 'Disable sound feedback' : 'Enable sound feedback'} aria-pressed={preferences.soundEnabled} onClick={() => onUpdate({ soundEnabled: !preferences.soundEnabled })}>
      {preferences.soundEnabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}{preferences.soundEnabled ? 'On' : 'Off'}
    </button></div>
    <label className="mascot-setting-select"><span>Mascot size</span><select value={preferences.size} onChange={(event) => onUpdate({ size: event.currentTarget.value as MascotPreferencesState['size'] })}>
      <option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option>
    </select></label>
    <label className="mascot-setting-select"><span>Personality</span><select value={preferences.personality} onChange={(event) => onUpdate({ personality: event.currentTarget.value as MascotPreferencesState['personality'] })}>
      <option value="professional">Professional</option><option value="balanced">Balanced</option><option value="playful">Playful</option>
    </select></label>
    <p>Reduced motion follows your Windows setting: {reducedMotion ? 'on' : 'off'}.</p>
    <button type="button" className="mascot-tip" onClick={onTip}>What can Buddy do?</button>
    <button type="button" className="mascot-reset" onClick={onResetPosition}>Reset position</button>
    <button type="button" className="mascot-hide" onClick={() => onUpdate({ enabled: false })}>Hide Buddy</button>
  </section>;
}
