import request from './request'
import OSS from 'ali-oss'

/**
 * 获取 STS 临时凭证
 */
export function getStsToken() {
  return request.get('/ai/api/file/sts')
}

/**
 * 前端直传文件到 OSS
 * @param {object} stsConfig - STS 凭证（accessKeyId, accessKeySecret, securityToken, bucket, endpoint, region, uploadDir）
 * @param {File} file - 文件对象
 * @returns {string} ossUrl - 文件公网 URL
 */
export async function uploadFileToOss(stsConfig, file) {
  const client = new OSS({
    region: stsConfig.region,
    accessKeyId: stsConfig.accessKeyId,
    accessKeySecret: stsConfig.accessKeySecret,
    stsToken: stsConfig.securityToken,
    bucket: stsConfig.bucket,
  })

  // 生成唯一文件名：uploadDir + 时间戳 + 原始文件名
  const ext = file.name.split('.').pop().toLowerCase()
  const timestamp = Date.now()
  const ossKey = `${stsConfig.uploadDir}${timestamp}-${file.name.replace(/\s/g, '_')}`

  await client.put(ossKey, file)

  // 生成带签名的公网访问 URL（bucket 为私有，签名有效期 30 分钟）
  const signedUrl = client.signatureUrl(ossKey, {
    expires: 1800, // 30 分钟
  })

  // signatureUrl 返回的是相对路径 /object?签名参数，需要补全为公网访问 URL
  if (signedUrl.startsWith('/')) {
    const endpointHost = stsConfig.endpoint.replace(/^https?:\/\//, '')
    return `https://${stsConfig.bucket}.${endpointHost}${signedUrl}`
  }
  // 如果已经是完整 URL 则直接返回
  return signedUrl
}

/**
 * 判断是否为 NDJSON 格式（纯 JSON 行，无 SSE event/data 包装）
 */
function isNdjsonLine(line) {
  if (!line || !line.startsWith('{')) return false
  try {
    const obj = JSON.parse(line)
    return 'index' in obj || 'success' in obj || 'fileName' in obj || 'successCount' in obj
  } catch {
    return false
  }
}

/**
 * 处理 SSE 事件（file / done / error）
 * done 事件不在此处调用 onDone，由流结束统一处理
 */
function handleSseEvent(eventType, eventData, callbacks) {
  if (eventType === 'file') {
    try {
      const data = JSON.parse(eventData)
      callbacks.onFile?.(data)
    } catch {
      // 忽略解析失败
    }
  } else if (eventType === 'done') {
    // 跳过，onDone 由流结束统一调用
  } else if (eventType === 'error') {
    try {
      const data = JSON.parse(eventData)
      callbacks.onError?.(new Error(data.message || '解析失败'))
    } catch {
      callbacks.onError?.(new Error(eventData))
    }
  }
}

/**
 * 通用流式解析器：同时支持标准 SSE 和 NDJSON 格式
 * SSE 状态（eventType / eventData）必须在循环外部持久化，
 * 因为 event: 行和 data: 行是不同行，需要跨行累积。
 */
function createStreamProcessor(callbacks) {
  let buffer = ''
  let isNdjson = false
  let ndjsonDetected = false
  // SSE 状态：跨 chunk 和跨行持久化
  let sseEventType = ''
  let sseEventData = ''

  function processChunk(value) {
    buffer += value
    const lines = buffer.split('\n')
    buffer = lines.pop() // 保留不完整的最后一行到下一个 chunk

    // 首次检测到内容时，自动判断格式
    if (!ndjsonDetected) {
      const firstContent = lines.find((l) => {
        const t = l.trim()
        return t && !t.startsWith(':')
      })
      if (firstContent) {
        isNdjson = isNdjsonLine(firstContent.trim())
        ndjsonDetected = true
        console.log('[SSE] Format detected:', isNdjson ? 'NDJSON' : 'SSE')
        console.log('[SSE] First content line:', firstContent.trim().substring(0, 200))
      }
    }

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue

      if (isNdjson) {
        // NDJSON 模式：直接解析 JSON 行
        if (line.startsWith('{')) {
          try {
            const data = JSON.parse(line)
            console.log('[SSE] Parsed NDJSON line, index:', data.index)
            if (!('successCount' in data) && !('joinedFileIds' in data)) {
              callbacks.onFile?.(data)
            }
          } catch (e) {
            console.warn('[SSE] Failed to parse NDJSON line:', line.substring(0, 100), e.message)
          }
        }
      } else {
        // 标准 SSE 模式：event: 和 data: 可能在不同行
        if (line.startsWith('event:')) {
          sseEventType = line.slice(6).trim()
          console.log('[SSE] Got event type:', sseEventType)
        } else if (line.startsWith('data:')) {
          sseEventData = line.slice(5).trim()
          console.log('[SSE] Got data:', sseEventData.substring(0, 100))
          // 同时有 event 和 data 时触发事件
          if (sseEventType && sseEventData) {
            handleSseEvent(sseEventType, sseEventData, callbacks)
            sseEventType = ''
            sseEventData = ''
          }
        } else if (line.startsWith('id:') || line.startsWith('retry:')) {
          // SSE 标准字段，忽略
        } else if (line.startsWith(':')) {
          // SSE 注释行，忽略
        } else {
          // 非标准行，可能是空行或其他
        }
      }
    }
  }

  function flush() {
    if (!buffer.trim()) return
    if (isNdjson) {
      if (buffer.trim().startsWith('{')) {
        try {
          const data = JSON.parse(buffer.trim())
          if (!('successCount' in data) && !('joinedFileIds' in data)) {
            callbacks.onFile?.(data)
          }
        } catch {
          // 忽略
        }
      }
    } else {
      // 刷新 buffer 中剩余的 SSE 事件
      let flushEventType = sseEventType
      let flushEventData = sseEventData
      for (const rawLine of buffer.split('\n')) {
        const line = rawLine.trim()
        if (line.startsWith('event:')) {
          flushEventType = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          flushEventData = line.slice(5).trim()
        }
      }
      if (flushEventType && flushEventData) {
        handleSseEvent(flushEventType, flushEventData, callbacks)
      }
    }
  }

  return { processChunk, flush }
}

/**
 * 批量解析文件（SSE 流式响应）
 * 请求体：[{ index, fileName, ossUrl }, ...]
 * SSE 事件：file（逐个推送）、done（全部完成）、error（异常）
 * 也支持 NDJSON 格式（纯 JSON 行，无 event/data 包装）
 *
 * @param {Array<{index: number, fileName: string, ossUrl: string}>} files
 * @param {object} callbacks - { onFile, onDone, onError }
 * @returns {AbortController}
 */
export function batchParseFiles(files, callbacks) {
  const controller = new AbortController()

  const url = '/ai/api/file/batch/parse'
  const baseURL = window.CHATBOT_CONFIG?.baseUrl ?? ''
  const fullUrl = baseURL + url

  async function fetchStream() {
    console.log('[SSE] Starting batch parse request to:', fullUrl)
    try {
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(files),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      console.log('[SSE] Response status:', response.status, 'Content-Type:', response.headers.get('Content-Type'))

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const processor = createStreamProcessor(callbacks)

      while (true) {
        const { done: readerDone, value } = await reader.read()
        if (readerDone) break

        processor.processChunk(decoder.decode(value, { stream: true }))
      }

      // 处理剩余 buffer
      processor.flush()

      console.log('[SSE] Stream ended, calling onDone')
      callbacks.onDone?.()
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('[SSE] Request aborted')
        callbacks.onDone?.()
      } else {
        console.error('[SSE] Fetch error:', error)
        callbacks.onError?.(error)
      }
    }
  }

  fetchStream()
  return controller
}

/**
 * 单文件重试解析（SSE 流式响应）
 * @param {object} fileItem - { index, fileName, ossUrl }
 * @param {object} callbacks - { onFile, onDone, onError }
 * @returns {AbortController}
 */
export function retryParseFile(fileItem, callbacks) {
  const controller = new AbortController()

  const url = '/ai/api/file/retry'
  const baseURL = window.CHATBOT_CONFIG?.baseUrl ?? ''
  const fullUrl = baseURL + url

  async function fetchStream() {
    try {
      const response = await fetch(fullUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fileItem),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      console.log('[SSE] Response status:', response.status, 'Content-Type:', response.headers.get('Content-Type'))

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const processor = createStreamProcessor(callbacks)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        processor.processChunk(decoder.decode(value, { stream: true }))
      }

      // 处理剩余 buffer
      processor.flush()

      callbacks.onDone?.()
    } catch (error) {
      if (error.name === 'AbortError') {
        callbacks.onDone?.()
      } else {
        callbacks.onError?.(error)
      }
    }
  }

  fetchStream()
  return controller
}

/**
 * 单文件导出 Excel
 */
export function downloadExcel(jsonData) {
  return request.post('/ai/api/file/excel', jsonData, {
    responseType: 'blob',
  })
}

/**
 * 批量导出 Excel
 */
export function batchDownloadExcel(jsonDataList) {
  return request.post('/ai/api/file/batch/excel', jsonDataList, {
    responseType: 'blob',
  })
}

/**
 * 确认提交文件数据
 */
export function confirmFileData(data) {
  return request.post('/ai/api/file/confirm', data)
}
