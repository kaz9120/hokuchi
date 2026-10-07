// MOSH テーマ。値は MOSH の Marp テンプレートと mosh-slide-design (Brand Book) に揃える
import type { Theme } from '../../runtime/types'
import logo from './assets/logo-mosh.svg'
import bgCover from './assets/bg-cover.svg'
import './mosh.css'

export const mosh: Theme = {
  name: 'mosh',
  className: 'theme-mosh',
  Frame: () => (
    <div className="frame">
      <img src={logo} alt="MOSH" style={{ position: 'absolute', right: 28, top: 24, height: 24 }} />
      <div style={{ position: 'absolute', right: 28, bottom: 16, fontSize: 14, color: 'var(--fg-sub)' }}>© MOSH, Inc.</div>
    </div>
  ),
  OgCard: ({ talk }) => (
    <div style={{ position: 'absolute', inset: 0, background: `url(${bgCover}) center / cover`, fontFamily: 'var(--font)', color: 'var(--fg)' }}>
      <img src={logo} alt="MOSH" style={{ position: 'absolute', left: 80, top: 64, height: 36 }} />
      <div style={{ position: 'absolute', left: 80, right: 80, top: 190, fontSize: 68, fontWeight: 800, lineHeight: 1.3, fontFeatureSettings: "'palt'" }}>{talk.title}</div>
      <div style={{ position: 'absolute', left: 80, bottom: 64, fontSize: 28, fontWeight: 600, color: 'var(--fg-sub)' }}>
        {talk.event?.name ? `${talk.event.name} ・ ` : ''}
        {talk.speaker}
      </div>
    </div>
  ),
}
