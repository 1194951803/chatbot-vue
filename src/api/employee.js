import request from './request'

/**
 * 员工自助意图识别
 */
export function recognizeIntent(prompt) {
  return request.get('/ai/api/intent/employee', { params: { prompt } })
}