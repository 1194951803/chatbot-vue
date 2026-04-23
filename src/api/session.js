import request from './request'

/**
 * 获取会话列表（分页）
 */
export function listSessions(page = 1, pageSize = 20) {
  return request.get('/ai/api/chat/session/list', {
    params: { page, pageSize },
  })
}

/**
 * 新建会话
 */
export function createSessionApi(title) {
  return request.post('/ai/api/chat/session', { title })
}

/**
 * 删除会话
 */
export function deleteSessionApi(id) {
  return request.delete(`/ai/api/chat/session/${id}`)
}

/**
 * 获取会话历史消息
 */
export function getSessionMessages(id) {
  return request.get(`/ai/api/chat/session/${id}/messages`)
}