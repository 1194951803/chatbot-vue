/**
 * 流式响应处理工具
 * 使用 fetch + ReadableStream 处理 SSE 格式的流式数据
 */

/**
 * 处理流式响应
 * @param {string} url - 请求地址
 * @param {object} options - fetch 选项
 * @param {function} onChunk - 每收到一块数据时的回调
 * @param {function} onDone - 流结束时的回调
 * @param {function} onError - 错误回调
 * @returns {AbortController} 可用于中断请求
 */
export function createStreamRequest(url, options, { onChunk, onDone, onError }) {
  const controller = new AbortController()

  async function fetchStream() {
    try {
      console.log('[Stream] Fetching:', url, options)
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      })

      console.log('[Stream] Response status:', response.status)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // 按行处理 SSE 格式的数据
        const lines = buffer.split('\n')
        buffer = lines.pop() // 保留不完整的最后一行

        for (const line of lines) {
          const trimmed = line.trim()
          if (trimmed.startsWith('data:')) {
            const data = trimmed.slice(5).trim()
            if (data === '[DONE]') {
              continue
            }
            try {
              const parsed = JSON.parse(data)
              onChunk?.(parsed)
            } catch {
              // 非 JSON 数据，直接传递文本
              onChunk?.(data)
            }
          }
        }
      }

      // 处理剩余的 buffer
      if (buffer.trim().startsWith('data:')) {
        const data = buffer.trim().slice(5).trim()
        if (data !== '[DONE]') {
          try {
            onChunk?.(JSON.parse(data))
          } catch {
            onChunk?.(data)
          }
        }
      }

      onDone?.()
    } catch (error) {
      console.error('[Stream] Error:', error.name, error.message)
      if (error.name === 'AbortError') {
        // 用户主动中断，不报错
        onDone?.()
      } else {
        onError?.(error)
      }
    }
  }

  fetchStream()

  return controller
}

export default createStreamRequest