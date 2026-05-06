import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useChatStore = defineStore('chat', () => {
  const messages = ref([])
  const isStreaming = ref(false)
  const currentStreamContent = ref('')
  const abortController = ref(null)

  function addMessage(msg) {
    messages.value.push(msg)
    return msg
  }

  function setStreaming(val) {
    isStreaming.value = val
  }

  function setStreamContent(content) {
    currentStreamContent.value = content
  }

  function appendStreamContent(text) {
    currentStreamContent.value += text
  }

  function setAbortController(controller) {
    abortController.value = controller
  }

  function abortStream() {
    if (abortController.value) {
      abortController.value.abort()
      abortController.value = null
      isStreaming.value = false
    }
  }

  function clearMessages() {
    messages.value = []
  }

  /**
   * 加载历史消息（从后端返回的 question/answer 对映射为前端消息格式）
   */
  function loadHistoryMessages(pairs) {
    const mapped = []
    for (const pair of pairs) {
      const time = formatTs(pair.createTs)
      if (pair.question) {
        mapped.push({ role: 'user', content: pair.question, time })
      }
      if (pair.answer) {
        mapped.push({
          role: 'assistant',
          content: pair.answer,
          time,
          rating: pair.rating || 0,
        })
      }
    }
    messages.value = mapped
  }

  function formatTs(ts) {
    if (!ts) return ''
    // 后端格式 "2026-04-20 10:30:00"，提取 HH:MM
    const match = ts.match(/(\d{2}:\d{2})/)
    return match ? match[1] : ts
  }

  return {
    messages,
    isStreaming,
    currentStreamContent,
    abortController,
    addMessage,
    setStreaming,
    setStreamContent,
    appendStreamContent,
    setAbortController,
    abortStream,
    clearMessages,
    loadHistoryMessages,
  }
})