import { defineStore } from 'pinia'
import { ref } from 'vue'
import { parseEmployeeAnswer, parseFileContent, buildCardFromToolCall, formatHistoryTime } from '../utils/historyMapper'

export const useChatStore = defineStore('chat', () => {
  const messages = ref([])
  const isStreaming = ref(false)
  const currentStreamContent = ref('')
  const abortController = ref(null)
  const employeeSessionId = ref(null)
  const modelSessionId = ref(null)  // 普通客服/人才发展的大模型上下文标识

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

  function setEmployeeSessionId(id) {
    employeeSessionId.value = id
  }

  function clearEmployeeSessionId() {
    employeeSessionId.value = null
  }

  function setModelSessionId(id) {
    modelSessionId.value = id
  }

  function clearModelSessionId() {
    modelSessionId.value = null
  }

  /**
   * 加载历史消息（从后端 FileChatHistoryMessageVo 映射为前端消息格式）
   */
  function loadHistoryMessages(pairs) {
    const mapped = []

    for (const item of pairs) {
      const functype = item.functype ?? 0
      const time = formatHistoryTime(item)

      switch (functype) {
        case 0:  // 客服模式 — 普通 Markdown 文本
        case 4: {  // 人才发展模式
          if (item.question) {
            mapped.push({ role: 'user', content: item.question, time })
          }
          if (item.answer) {
            mapped.push({
              role: 'assistant',
              content: item.answer,
              time,
              rating: item.rating || 0,
            })
          }
          break
        }

        case 2: {  // 文件转换模式
          if (item.question) {
            mapped.push({ role: 'user', content: item.question, time })
          }
          if (item.files && item.files.length > 0) {
            mapped.push({
              role: 'assistant',
              type: 'file_list',
              files: item.files.map((f, idx) => ({
                index: idx + 1,
                fileId: f.uuid || `hist-file-${item.uuid || 'unknown'}-${idx}`,
                fileName: f.fileName || 'Unknown',
                ossUrl: null,
                uploadTime: time || '',
                status: f.status === 1 ? 'extracted' : 'failed',
                fileStatus: f.status === 1 ? 'success' : 'failed',
                statusMessage: f.status === 1 ? '文件解析完成' : '解析失败',
                extractedData: parseFileContent(f.fileContent),
                isExtracting: false,
                extractError: f.status !== 1 ? '解析失败' : '',
              })),
              rejected: [],
              time,
              noFeedback: true,
              _version: 0,
            })
          }
          break
        }

        case 3: {  // 员工自助模式
          if (item.question) {
            mapped.push({ role: 'user', content: item.question, time })
          }
          if (item.answer) {
            const parsed = parseEmployeeAnswer(item.answer)
            if (parsed && parsed.tool_calls && parsed.tool_calls.name) {
              mapped.push(buildCardFromToolCall(parsed.tool_calls, parsed, time))
            } else if (parsed && parsed.content) {
              mapped.push({ role: 'assistant', content: parsed.content, time, noFeedback: true })
            }
          }
          break
        }

        default: {  // 未知 functype，按客服模式处理
          if (item.question) {
            mapped.push({ role: 'user', content: item.question, time })
          }
          if (item.answer) {
            mapped.push({
              role: 'assistant',
              content: item.answer,
              time,
              rating: item.rating || 0,
            })
          }
          break
        }
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
    employeeSessionId,
    addMessage,
    setStreaming,
    setStreamContent,
    appendStreamContent,
    setAbortController,
    abortStream,
    clearMessages,
    loadHistoryMessages,
    setEmployeeSessionId,
    clearEmployeeSessionId,
    setModelSessionId,
    clearModelSessionId,
  }
})