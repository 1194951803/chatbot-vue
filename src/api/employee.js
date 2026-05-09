import request from './request'

/**
 * 员工自助意图识别（支持多轮对话）
 */
export function recognizeIntent(prompt, conversationId) {
  const params = { prompt }
  if (conversationId) params.conversationId = conversationId
  return request.get('/ai/api/intent/employee', { params })
}

/**
 * 清除员工自助多轮对话上下文
 */
export function clearIntentConversation(conversationId) {
  return request.get('/ai/api/intent/employee/clear', { params: { conversationId } })
}