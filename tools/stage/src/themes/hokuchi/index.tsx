// hokuchi テーマ (個人の登壇)。値は BRAND.md と hidoko の tokens.css から導く (ADR-0003)。夜の焚き火が基調
import type { Theme } from '../../runtime/types'
import './hokuchi.css'

export const hokuchi: Theme = {
  name: 'hokuchi',
  className: 'theme-hokuchi',
  Frame: ({ talk }) => (
    <div className="frame">
      <div style={{ position: 'absolute', right: 28, bottom: 16, fontSize: 14, color: 'var(--muted)', letterSpacing: '0.04em' }}>{talk.speaker}</div>
    </div>
  ),
  OgCard: ({ talk }) => (
    <div style={{ position: 'absolute', inset: 0, background: 'var(--stage-bg)', fontFamily: 'var(--font)', color: 'var(--fg)' }}>
      <div style={{ position: 'absolute', left: 80, top: 72, fontSize: 24, fontWeight: 700, color: 'var(--accent)', letterSpacing: '0.08em' }}>
        {talk.event?.name ?? 'Talk'}
      </div>
      <div style={{ position: 'absolute', left: 80, right: 80, top: 170, fontSize: 68, fontWeight: 700, lineHeight: 1.3, fontFeatureSettings: "'palt'" }}>{talk.title}</div>
      <div style={{ position: 'absolute', left: 80, bottom: 64, fontSize: 26, color: 'var(--fg-sub)' }}>焚き火を愛するエンジニア ・ {talk.speaker}</div>
    </div>
  ),
}
