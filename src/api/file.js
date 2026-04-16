import request from './request'
import { createStreamRequest } from '../utils/stream'

/**
 * 上传文件
 */
export function uploadFile(file) {
  const formData = new FormData()
  formData.append('file', file)
  return request.post('/ai/api/file/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

/**
 * 查询文件处理状态
 * 后端使用 @RequestBody，需将 fileId 放在请求体中
 */
export function getFileStatus(fileId) {
  return request.post('/ai/api/file/status', fileId, {
    headers: { 'Content-Type': 'text/plain' },
  })
}

/**
 * 下载转换后的 Excel 文件
 */
export function downloadExcel(fileId) {
  return request.get('/ai/api/file/excel', {
    params: { fileId },
    responseType: 'blob',
  })
}

/**
 * 提取文件内容（SSE 流式响应）
 * @param {string} fileId - 文件ID
 * @param {object} callbacks - { onChunk, onDone, onError }
 * @returns {AbortController} 可用于中断请求
 */
export function extractFileContent(fileId, callbacks) {
  return createStreamRequest(
    '/ai/api/stream/analysis/extract',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId }),
    },
    callbacks,
  )
}

/**
 * 确认提交文件数据
 * @param {object} data - 提取并编辑后的文件数据
 * @returns {Promise} 后端响应
 */
export function confirmFileData(data) {
  return request.post('/ai/api/file/confirm', data)
}