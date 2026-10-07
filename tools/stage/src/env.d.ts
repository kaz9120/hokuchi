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
interface ImportMeta {
  readonly env: { readonly DEV: boolean }
}
