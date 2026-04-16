import request from './request'

/**
 * 人才发展智能体对话（流式响应）
 */
export function sendAgentMessage(data) {
  return request.post('/ai/api/person/post/match', data, {
    responseType: 'stream',
  })
}