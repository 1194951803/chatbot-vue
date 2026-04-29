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

  const ext = file.name.split('.').pop().toLowerCase()
  const timestamp = Date.now()
  const ossKey = `${stsConfig.uploadDir}${timestamp}-${file.name.replace(/\s/g, '_')}`

  await client.put(ossKey, file)

  const signedUrl = client.signatureUrl(ossKey, { expires: 1800 })

  if (signedUrl.startsWith('/')) {
    const endpointHost = stsConfig.endpoint.replace(/^https?:\/\//, '')
    return `https://${stsConfig.bucket}.${endpointHost}${signedUrl}`
  }
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
 */
function handleSseEvent(eventType, eventData, callbacks) {
  if (eventType === 'file') {
    try {
      callbacks.onFile?.(JSON.parse(eventData))
    } catch {
      // 忽略解析失败
    }
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
 * 行尾归一化：\r\n / \r → \n
 */
function normalizeSseText(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

/**
 * 通用流式解析器：同时支持标准 SSE 和 NDJSON 格式
 */
function createStreamProcessor(callbacks) {
  let buffer = ''
  let isNdjson = false
  let ndjsonDetected = false
  let sseEventType = ''
  let sseEventData = ''

  function processChunk(value) {
    buffer += value
    const normalized = normalizeSseText(buffer)
    const lines = normalized.split('\n')
    buffer = lines.pop()

    if (!ndjsonDetected) {
      const firstContent = lines.find((l) => {
        const t = l.trim()
        return t && !t.startsWith(':')
      })
      if (firstContent) {
        isNdjson = isNdjsonLine(firstContent.trim())
        ndjsonDetected = true
      }
    }

    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line) continue

      if (isNdjson) {
        if (line.startsWith('{')) {
          try {
            const data = JSON.parse(line)
            if (!('successCount' in data) && !('joinedFileIds' in data)) {
              callbacks.onFile?.(data)
            }
          } catch {
            // 忽略
          }
        }
      } else {
        if (line.startsWith('event:')) {
          sseEventType = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          sseEventData = line.slice(5).trim()
          if (sseEventType && sseEventData) {
            handleSseEvent(sseEventType, sseEventData, callbacks)
            sseEventType = ''
            sseEventData = ''
          }
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
      const normalized = normalizeSseText(buffer)
      let flushEventType = sseEventType
      let flushEventData = sseEventData
      for (const rawLine of normalized.split('\n')) {
        const line = rawLine.trim()
        if (line.startsWith('event:')) {
          flushEventType = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          flushEventData = line.slice(5).trim()
          if (flushEventType && flushEventData) {
            handleSseEvent(flushEventType, flushEventData, callbacks)
            flushEventType = ''
            flushEventData = ''
          }
        }
      }
    }
  }

  return { processChunk, flush }
}

/**
 * 批量解析文件（SSE 流式响应）
 */
export function batchParseFiles(files, callbacks) {
  const controller = new AbortController()

  const url = '/ai/api/file/batch/parse'
  const baseURL = window.CHATBOT_CONFIG?.baseUrl ?? ''
  const fullUrl = baseURL + url

  async function fetchStream() {
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

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const processor = createStreamProcessor(callbacks)

      while (true) {
        const { done: readerDone, value } = await reader.read()
        if (readerDone) break

        processor.processChunk(decoder.decode(value, { stream: true }))
      }

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
 * 单文件重试解析（SSE 流式响应）
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

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      const processor = createStreamProcessor(callbacks)

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        processor.processChunk(decoder.decode(value, { stream: true }))
      }

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
