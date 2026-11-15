import DOMPurify from 'dompurify'
import { marked } from 'marked'
import { useMemo } from 'react'

/** Claude が書いた Markdown を表示する。HTML は DOMPurify で消毒してから入れる */
export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const html = useMemo(() => DOMPurify.sanitize(marked.parse(text, { async: false, breaks: true }) as string), [text])
  return (
    <div
      className={`space-y-2 text-base leading-7 text-fg [&_a]:text-brand [&_a]:underline [&_code]:rounded [&_code]:bg-surface-sunken [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.9em] [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:list-decimal [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface-sunken [&_pre]:p-3 [&_strong]:text-fg-strong [&_table]:text-sm [&_td]:border [&_td]:border-line-subtle [&_td]:px-2 [&_th]:border [&_th]:border-line-subtle [&_th]:px-2 [&_ul]:list-disc ${className}`}
      // 上で消毒している
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
