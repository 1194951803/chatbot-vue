import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useChatStore = defineStore('chat', () => {
  const messages = ref([])
  const isStreaming = ref(false)
  const currentStreamContent = ref('')
  const abortController = ref(null)

  function addMessage(msg) {
    messages.value.push(msg)
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
  }
})