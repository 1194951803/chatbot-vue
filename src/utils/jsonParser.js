/**
 * JSON 解析工具
 * 从 SSE 流式返回的 Markdown 文本中提取 JSON 代码块并解析
 */

/**
 * 从 Markdown 文本中提取并解析 JSON
 * 优先匹配 ```json ... ``` 代码块，回退为括号匹配
 * @param {string} markdownText - 包含 JSON 代码块的 Markdown 文本
 * @returns {object|null} 解析后的 JSON 对象，失败返回 null
 */
export function extractJsonFromMarkdown(markdownText) {
  if (!markdownText || typeof markdownText !== 'string') {
    return null
  }

  // 方式 1：优先匹配 ```json ... ``` 代码块
  const jsonBlockRegex = /```json\s*\n?([\s\S]*?)\n?```/
  const match = markdownText.match(jsonBlockRegex)
  if (match && match[1]) {
    try {
      return JSON.parse(match[1].trim())
    } catch {
      // 继续尝试其他方式
    }
  }

  // 方式 2：匹配 ``` ... ``` 普通代码块（不带 json 标记）
  const genericBlockRegex = /```\s*\n?([\s\S]*?)\n?```/
  const genericMatch = markdownText.match(genericBlockRegex)
  if (genericMatch && genericMatch[1]) {
    try {
      return JSON.parse(genericMatch[1].trim())
    } catch {
      // 继续尝试括号匹配
    }
  }

  // 方式 3：括号匹配 — 找到最外层的 { ... } 并尝试解析
  const firstBrace = markdownText.indexOf('{')
  const lastBrace = markdownText.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const jsonStr = markdownText.substring(firstBrace, lastBrace + 1)
    try {
      return JSON.parse(jsonStr)
    } catch {
      return null
    }
  }

  return null
}

export default extractJsonFromMarkdown
