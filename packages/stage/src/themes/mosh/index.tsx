// MOSH テーマ。値は MOSH の Marp テンプレートと mosh-slide-design (Brand Book) に揃える
import type { Theme } from '../../runtime/types'
import logo from './assets/logo-mosh.svg'
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
}
