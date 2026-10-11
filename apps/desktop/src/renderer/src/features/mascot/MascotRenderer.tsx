import { Component, type ErrorInfo, type ReactNode } from 'react';
import type { MascotMood } from './mascot-model';
import { MascotCharacter } from './MascotCharacter';

type BoundaryProps = { children: ReactNode; compact: boolean; mood: MascotMood };
type BoundaryState = { failed: boolean };

class MascotAssetBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState { return { failed: true }; }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the inline fallback visible; detailed renderer errors are handled by React's app logger.
    void error;
    void info;
  }

  override render(): ReactNode {
    if (this.state.failed) return <FallbackMascot mood={this.props.mood} compact={this.props.compact} />;
    return this.props.children;
  }
}

function FallbackMascot({ mood, compact }: { mood: MascotMood; compact: boolean }) {
  return <svg className={`mascot-art mascot-art-fallback mood-${mood}${compact ? ' mascot-art-compact' : ''}`} viewBox="0 0 180 216" role="img" aria-hidden={compact || undefined} aria-label={`BCIS Buddy, ${mood}`}>
    <circle cx="90" cy="105" r="48" fill="#eef6ff" stroke="#0b315e" strokeWidth="4" />
    <path d="M47 78Q52 43 90 43Q128 43 133 78Q91 62 47 78Z" fill="#1472cf" stroke="#0b315e" strokeWidth="4" />
    <path d="M82 53Q90 45 98 53M85 57Q90 52 95 57M88 61Q90 59 92 61" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" />
    <text x="90" y="77" fill="white" fontSize="10" fontWeight="800" textAnchor="middle">BCIS</text>
    <path d="M50 88Q39 91 42 111M130 88Q141 91 138 111" fill="none" stroke="#0877d8" strokeWidth="8" strokeLinecap="round" />
    <circle cx="73" cy="106" r="5" fill="#1472b9" /><circle cx="107" cy="106" r="5" fill="#1472b9" />
    <path d="M82 122Q90 130 98 122" fill="none" stroke="#0b315e" strokeWidth="3" strokeLinecap="round" />
    <path d="M62 165Q90 151 118 165L124 194H56Z" fill="#1455a4" stroke="#0b315e" strokeWidth="4" />
    <path d="M82 171Q90 163 98 171M85 175Q90 171 95 175" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" />
  </svg>;
}

export function MascotRenderer({ mood, compact = false }: { mood: MascotMood; compact?: boolean }) {
  return <MascotAssetBoundary mood={mood} compact={compact}><MascotCharacter mood={mood} compact={compact} /></MascotAssetBoundary>;
}

export { MascotAssetBoundary };
