// hokuchi テーマ (個人の登壇)。値は BRAND.md と hidoko の tokens.css から導く (ADR-0003)。夜の焚き火が基調
import type { Theme } from '../../runtime/types'
import './hokuchi.css'

export const hokuchi: Theme = {
  name: 'hokuchi',
  className: 'theme-hokuchi',
  // ふわっと動かす (BRAND.md 6.1)。MOSH より 1 割ゆっくり
  motion: { scale: 1.1 },
  Frame: ({ talk }) => (
    <div className="frame">
      <div style={{ position: 'absolute', right: 28, bottom: 16, fontSize: 14, color: 'var(--muted)', letterSpacing: '0.04em' }}>{talk.speaker}</div>
    </div>
  ),
}
