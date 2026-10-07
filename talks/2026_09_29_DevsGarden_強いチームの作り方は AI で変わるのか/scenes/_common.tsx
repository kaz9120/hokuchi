// このトークの中で使い回す部品
import type { CSSProperties } from 'react'

export const CHAPTERS = ['AI で何が変わったのか', 'MOSH における生産性', '組織的生産性と Engineer Excellence', 'チームリードとして', '現在地とこれから']

/** 人のアイコン。tone で色を変える */
export function Person({ x, y, size = 88, tone = 'base', node, style }: { x: number; y: number; size?: number; tone?: 'base' | 'accent' | 'muted'; node?: string; style?: CSSProperties }) {
  const color = tone === 'accent' ? 'var(--accent)' : tone === 'muted' ? 'var(--muted)' : 'var(--fg-sub)'
  return (
    <div
      data-node={node}
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--surface)',
        border: `3px solid ${color}`,
        boxSizing: 'border-box',
        transition: 'border-color 0.5s',
        ...style,
      }}
    >
      <svg viewBox="0 0 48 48" width="100%" height="100%" style={{ display: 'block' }}>
        <circle cx="24" cy="18" r="7.5" fill={color} style={{ transition: 'fill 0.5s' }} />
        <path d="M10 39 C 12 29, 36 29, 38 39" fill={color} style={{ transition: 'fill 0.5s' }} />
      </svg>
    </div>
  )
}
