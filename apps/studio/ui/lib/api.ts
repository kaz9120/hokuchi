// ホームが使う API。契約は shared/api.ts。作品の画面は works.ts を使う
import type { HomeData, Kind, Seed } from '../../shared/api'
import { call } from './works'

export const api = {
  home: () => call<HomeData>('/api/home'),
  createWork: async (kind: Kind, seedId?: string) => (await call<{ key: string }>('/api/works', 'POST', { kind, seedId })).key,
  saveSeed: (seed: Partial<Seed>) => call<Seed>('/api/seeds', 'POST', seed),
}
