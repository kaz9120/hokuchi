declare module '*.svg' {
  const src: string
  export default src
}
declare module '*.png' {
  const src: string
  export default src
}
declare module '*.jpg' {
  const src: string
  export default src
}
declare module '*.webp' {
  const src: string
  export default src
}
declare module '*.css'
declare module 'virtual:talk' {
  const talk: import('./runtime/types').TalkDef
  export default talk
}
/** 画面の種類。Vite の define でビルドのときに決まる (node/vite.mjs) */
declare const __STAGE_VIEW__: 'present' | 'public'
interface ImportMeta {
  readonly env: { readonly DEV: boolean }
}
