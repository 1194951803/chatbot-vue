import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'

const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value
      } catch {
        // fallback
      }
    }
    return ''
  },
})

/**
 * 渲染 Markdown 文本为 HTML
 */
export function renderMarkdown(text) {
  return md.render(text)
}

export default md