import request from './request'

/**
 * 发送聊天消息（普通对话，流式响应）
 */
export function sendChatMessage(data) {
  return request.post('/ai/api/chatbot/chat', data, {
    responseType: 'stream',
  })
}