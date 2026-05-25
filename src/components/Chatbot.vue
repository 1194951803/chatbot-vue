<script setup>
import { ref, nextTick, computed, onMounted, onUnmounted, watch } from 'vue'
import { useChatStore } from '../stores/chat'
import { useModeStore } from '../stores/mode'
import { useSessionStore } from '../stores/session'
import { useFileStore } from '../stores/file'
import { createStreamRequest } from '../utils/stream'
import { renderMarkdown } from '../utils/markdown'
import MessageBubble from './MessageBubble.vue'

const emit = defineEmits(['file-action', 'upload-click', 'voice-click'])
const chatStore = useChatStore()
const modeStore = useModeStore()
const sessionStore = useSessionStore()
const fileStore = useFileStore()

const messageInput = ref('')
const messageContainer = ref(null)
const isVoiceRecording = ref(false)
let recognition = null

const config = window.CHATBOT_CONFIG || {}
const quickActions = config.quickActions || [
  { label: '人才发展', mode: 'talent_agent' },
  { label: '文件转换', mode: 'file_convert' },
  { label: '员工自助', mode: 'employee_self' },
  { label: '班子研判', mode: 'leadership_analysis' },
]
const greeting = config.greeting || '你好！我是 AI 助手，有什么可以帮助你的吗？'

const streamingHtml = computed(() => renderMarkdown(chatStore.currentStreamContent))

const showDropdown = ref(false)

function getCurrentModeLabel() {
  const current = quickActions.find((a) => a.mode === modeStore.currentMode)
  return current ? current.label : '切换功能'
}

// 初始化会话（由父组件 ChatbotContainer 负责加载）
onMounted(() => {
  document.addEventListener('click', closeDropdown)
})

onUnmounted(() => {
  document.removeEventListener('click', closeDropdown)
})

function closeDropdown() {
  showDropdown.value = false
}

// 监听历史消息加载完成，滚动到底部
watch(() => chatStore.messages.length, (newLen) => {
  if (newLen > 0) {
    scrollToBottom()
  }
})

// 监听模式切换，发送入口/退出提示
watch(() => modeStore.currentMode, (mode, prevMode) => {
  // 退出提示：仅退出到客服模式时发
  if (prevMode === modeStore.MODES.EMPLOYEE_SELF && mode === modeStore.MODES.CUSTOMER_SERVICE) {
    chatStore.clearEmployeeSessionId()
    chatStore.addMessage({
      role: 'system',
      content: '已退出员工自助模式，恢复为客服模式。',
      time: getCurrentTime(),
    })
    scrollToBottom()
    return
  }
  if (prevMode === modeStore.MODES.TALENT_AGENT && mode === modeStore.MODES.CUSTOMER_SERVICE) {
    chatStore.clearModelSessionId()
    chatStore.addMessage({
      role: 'system',
      content: '已退出人才发展模式，恢复为客服模式。',
      time: getCurrentTime(),
    })
    scrollToBottom()
    return
  }
  if (prevMode === modeStore.MODES.LEADERSHIP_ANALYSIS && mode === modeStore.MODES.CUSTOMER_SERVICE) {
    chatStore.clearModelSessionId()
    chatStore.addMessage({
      role: 'system',
      content: '已退出班子研判模式，恢复为客服模式。',
      time: getCurrentTime(),
    })
    scrollToBottom()
    return
  }
  if (prevMode === modeStore.MODES.FILE_CONVERT && mode === modeStore.MODES.CUSTOMER_SERVICE) {
    chatStore.addMessage({
      role: 'system',
      content: '已退出文件转换模式，恢复为客服模式。',
      time: getCurrentTime(),
    })
    scrollToBottom()
    return
  }

  // 进入提示
  if (mode === modeStore.MODES.EMPLOYEE_SELF) {
    chatStore.addMessage({
      role: 'system',
      content: '已进入员工自助模式。您可以告诉我需要什么帮助，例如：请假申请、薪酬查询、个人信息、申请记录、年度考核、绩效目标等。',
      time: getCurrentTime(),
    })
    scrollToBottom()
  } else if (mode === modeStore.MODES.TALENT_AGENT) {
    chatStore.addMessage({
      role: 'system',
      content: '已进入人才发展模式。请描述您的岗位需求或人员信息，我将为您推荐匹配的人才或岗位建议。',
      time: getCurrentTime(),
    })
    scrollToBottom()
  } else if (mode === modeStore.MODES.LEADERSHIP_ANALYSIS) {
    chatStore.addMessage({
      role: 'system',
      content: '已进入班子研判模式。请描述您想了解的班子情况，例如班子结构、年龄梯队、专业分布等，我将为您进行分析。',
      time: getCurrentTime(),
    })
    scrollToBottom()
  } else if (mode === modeStore.MODES.FILE_CONVERT) {
    chatStore.addMessage({
      role: 'system',
      content: '已进入文件转换模式。请上传需要转换的文件。',
      time: getCurrentTime(),
    })
    scrollToBottom()
  }
})

function scrollToBottom() {
  nextTick(() => {
    if (messageContainer.value) {
      messageContainer.value.scrollTop = messageContainer.value.scrollHeight
    }
  })
}

function getCurrentTime() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

// 发送消息
async function handleSend() {
  const content = messageInput.value.trim()
  console.log('[Chatbot] handleSend called, content:', content, 'isStreaming:', chatStore.isStreaming)
  if (!content || chatStore.isStreaming) return

  messageInput.value = ''

  // 添加用户消息
  const userMsg = { role: 'user', content, time: getCurrentTime() }
  chatStore.addMessage(userMsg)
  scrollToBottom()

  // 员工自助模式：SSE 流式意图识别接口（POST JSON Body）
  if (modeStore.currentMode === modeStore.MODES.EMPLOYEE_SELF) {
    const time = getCurrentTime()
    const apiUrl = window.CHATBOT_CONFIG?.baseUrl ?? ''
    let lastSessionId = null
    let accumulatedToolCalls = {}  // 按 index 累积 tool_calls 的 name 和 arguments

    console.log('[Employee Intent] 发起请求, URL:', `${apiUrl}/ai/api/intent/employee`)
    console.log('[Employee Intent] Request body:', JSON.stringify({
      prompt: content,
      chatSessionId: sessionStore.currentSessionId,
      sessionId: chatStore.employeeSessionId || undefined,
    }))

    chatStore.setStreaming(true)
    chatStore.setStreamContent('')

    const controller = createStreamRequest(
      `${apiUrl}/ai/api/intent/employee`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: content,
          chatSessionId: sessionStore.currentSessionId,
          sessionId: chatStore.employeeSessionId || undefined,
        }),
      },
      {
        onChunk(data) {
          console.log('[Employee Intent] onChunk 收到数据:', JSON.stringify(data))

          // ===== 处理 tool_complete 事件（后端注入业务数据后的完整 tool_calls） =====
          if (data._eventType === 'tool_complete') {
            console.log('[Employee Intent] 收到 tool_complete 事件:', JSON.stringify(data))
            if (data.session_id) {
              lastSessionId = data.session_id
              console.log('[Employee Intent] 提取 sessionId:', lastSessionId)
            }
            // tool_complete.tool_calls 格式：{"name":"xxx","arguments":{...完整数据...}}
            const tc = data.tool_calls
            if (tc?.name) {
              // 直接覆盖，使用后端注入的完整数据
              accumulatedToolCalls = { 0: { id: '', function: { name: tc.name, arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments || {}) } } }
              console.log('[Employee Intent] tool_complete 覆盖 tool_calls:', JSON.stringify(accumulatedToolCalls))
            }
            // tool_complete 不包含文本内容，直接返回
            return
          }

          // 提取 sessionId（每帧都可能包含，取最新的）
          if (data?.output?.session_id) {
            lastSessionId = data.output.session_id
            console.log('[Employee Intent] 提取 sessionId:', lastSessionId)
          }
          // 累积 tool_calls（增量流式返回，需要拼接 arguments）
          if (data.output?.choices?.[0]?.message?.tool_calls) {
            const tcs = data.output.choices[0].message.tool_calls
            for (const tc of tcs) {
              const idx = tc.index ?? 0
              if (!accumulatedToolCalls[idx]) {
                accumulatedToolCalls[idx] = { id: tc.id, function: { name: '', arguments: '' } }
              }
              // name 只在首帧出现，累积一次即可
              if (tc.function?.name) {
                accumulatedToolCalls[idx].function.name = tc.function.name
              }
              // arguments 逐块追加
              if (tc.function?.arguments) {
                accumulatedToolCalls[idx].function.arguments += tc.function.arguments
              }
            }
            console.log('[Employee Intent] 累积 tool_calls:', JSON.stringify(accumulatedToolCalls))
          }
          // 提取增量文本 — 兼容两种格式：
          // 1. DashScope 原生格式：data.output.choices[0].message.content
          // 2. 通用 SSE 格式：data.output.text
          let text = ''
          if (typeof data === 'string') {
            text = data
          } else if (data.output?.text !== undefined) {
            text = data.output.text
          } else if (data.output?.choices?.[0]?.message?.content !== undefined) {
            text = data.output.choices[0].message.content
          }
          if (text) {
            console.log('[Employee Intent] 提取到文本:', text)
            chatStore.appendStreamContent(text)
            scrollToBottom()
          }
        },
        onDone() {
          console.log('[Employee Intent] onDone 流结束, sessionId:', lastSessionId)
          console.log('[Employee Intent] 累积完整文本:', chatStore.currentStreamContent)
          console.log('[Employee Intent] 累积 tool_calls:', JSON.stringify(accumulatedToolCalls))
          // 保存 sessionId，后续轮次回传
          if (lastSessionId) {
            chatStore.setEmployeeSessionId(lastSessionId)
          }
          chatStore.setStreaming(false)
          // 流结束后判断是否匹配到意图
          const fullText = chatStore.currentStreamContent
          const { intent, params } = extractIntentFromToolCalls(accumulatedToolCalls)
          console.log('[Employee Intent] 意图解析结果:', { intent, params })
          if (intent) {
            const card = buildCardFromIntent(intent, params, time)
            console.log('[Employee Intent] 构建卡片:', card)
            chatStore.addMessage(card)
          } else {
            // 未匹配，展示模型追问文本
            chatStore.addMessage({
              role: 'assistant',
              content: fullText || '未识别到您的意图，请换一种方式描述。',
              time,
              noFeedback: true,
            })
          }
          chatStore.setStreamContent('')
          scrollToBottom()
        },
        onError(err) {
          console.error('[Employee Intent Error]', err)
          chatStore.setStreaming(false)
          chatStore.setStreamContent('')
          // 接口失败时使用本地兜底
          const intent = detectIntent(content)
          const card = generateMockCard(intent)
          chatStore.addMessage(card)
          scrollToBottom()
        },
      },
    )

    chatStore.setAbortController(controller)
    return
  }

  // 如果当前没有会话，自动创建
  if (!sessionStore.currentSessionId) {
    const title = content.length > 10 ? content.substring(0, 10) : content
    const session = await sessionStore.createSession(title)
    if (!session) {
      chatStore.addMessage({
        role: 'system',
        content: '创建会话失败，请稍后重试',
      })
      scrollToBottom()
      return
    }
  }

  // 创建 AI 回复占位消息
  chatStore.setStreaming(true)
  chatStore.setStreamContent('')

  // 根据模式选择接口
  const currentMode = modeStore.currentMode
  const isTalentAgent = currentMode === modeStore.MODES.TALENT_AGENT
  const isLeadership = currentMode === modeStore.MODES.LEADERSHIP_ANALYSIS
  const apiUrl = window.CHATBOT_CONFIG?.baseUrl ?? ''
  const url = isTalentAgent
    ? `${apiUrl}/ai/api/person/post/match`
    : isLeadership
      ? `${apiUrl}/ai/api/stream/leader/ship`
      : `${apiUrl}/ai/api/chatbot/chat`

  console.log('[Chatbot] Request URL:', url)
  console.log('[Chatbot] Request body:', JSON.stringify({
    prompt: content,
    chatSessionId: sessionStore.currentSessionId,
    sessionId: chatStore.modelSessionId || undefined,
  }))

  let lastModelSessionId = null
  let accumulatedThoughtText = ''  // 累积思考过程文本
  let thoughtSeen = new Set()  // 去重：已累积的 thought 内容

  const controller = createStreamRequest(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: content,
        chatSessionId: sessionStore.currentSessionId,
        sessionId: chatStore.modelSessionId || undefined,
      }),
    },
    {
      onChunk(data) {
        // 提取 model sessionId（用于多轮对话上下文）
        if (data?.output?.session_id) {
          lastModelSessionId = data.output.session_id
        }
        let text = ''
        if (typeof data === 'string') {
          text = data
        } else if (data.output?.text !== undefined) {
          // 后端返回 { output: { text: '增量文本' } } 格式
          text = data.output.text
        } else if (data.output?.choices?.[0]?.message?.content !== undefined) {
          text = data.output.choices[0].message.content
        } else {
          text = data.content || data.text || data.delta || ''
        }
        chatStore.appendStreamContent(text)

        // 提取思考过程
        if (data.output?.thoughts && Array.isArray(data.output.thoughts)) {
          for (const t of data.output.thoughts) {
            let thoughtText = ''
            if (t.action_type === 'reasoning' && t.thought && t.thought.length > 0) {
              thoughtText = t.thought
            } else if (t.action_type === 'agentRag' && t.observation && t.observation.length > 0) {
              thoughtText = t.observation
            }
            if (thoughtText && !thoughtSeen.has(thoughtText)) {
              thoughtSeen.add(thoughtText)
              accumulatedThoughtText += thoughtText
              chatStore.setThoughtContent(accumulatedThoughtText)
            }
          }
        }

        scrollToBottom()
      },
      onDone() {
        // 保存 sessionId，后续请求回传
        if (lastModelSessionId) {
          chatStore.setModelSessionId(lastModelSessionId)
        }
        if (chatStore.currentStreamContent) {
          const msg = {
            role: 'assistant',
            content: chatStore.currentStreamContent,
            time: getCurrentTime(),
          }
          if (chatStore.currentThoughtContent) {
            msg.thoughtContent = chatStore.currentThoughtContent
          }
          chatStore.addMessage(msg)
          chatStore.setStreamContent('')
          chatStore.clearThoughtContent()
        }
        chatStore.setStreaming(false)
        scrollToBottom()
      },
      onError(err) {
        console.error('[Stream Error]', err)
        chatStore.setStreaming(false)
        chatStore.setStreamContent('')
        chatStore.addMessage({
          role: 'system',
          content: '消息发送失败，请稍后重试',
        })
        scrollToBottom()
      },
    },
  )

  chatStore.setAbortController(controller)
}

// 停止生成
function handleStop() {
  chatStore.abortStream()
}

function handleKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

// 快捷按钮切换逻辑
function handleQuickAction(action) {
  if (modeStore.currentMode === action.mode) {
    // 当前已是该模式，退出到客服模式
    modeStore.switchMode(modeStore.MODES.CUSTOMER_SERVICE)
  } else {
    modeStore.switchMode(action.mode)
  }
  showDropdown.value = false
}

function toggleDropdown() {
  showDropdown.value = !showDropdown.value
}

// 语音输入
function toggleVoice() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    alert('当前浏览器不支持语音输入，请使用 Chrome 浏览器')
    return
  }
  if (isVoiceRecording.value) {
    stopVoice()
    return
  }
  startVoice()
}

function startVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  recognition = new SpeechRecognition()
  recognition.lang = 'zh-CN'
  recognition.interimResults = true
  recognition.continuous = false

  recognition.onresult = (event) => {
    let text = ''
    for (let i = 0; i < event.results.length; i++) {
      text += event.results[i][0].transcript
    }
    messageInput.value = text
  }

  recognition.onend = () => {
    isVoiceRecording.value = false
    recognition = null
  }

  recognition.onerror = () => {
    isVoiceRecording.value = false
    recognition = null
  }

  recognition.start()
  isVoiceRecording.value = true
}

function stopVoice() {
  if (recognition) {
    recognition.stop()
  }
}

// 反馈操作
function handleLike(message) {
  console.log('[Feedback] Like:', message)
  // TODO: 上报到后端
}

function handleDislike(message) {
  console.log('[Feedback] Dislike:', message)
  // TODO: 上报到后端
}

// 重新生成
function handleRegenerate(message) {
  // 找到被重新生成的消息的前一条用户消息
  const idx = chatStore.messages.indexOf(message)
  if (idx <= 0) return

  const userMsg = chatStore.messages.slice(0, idx).reverse().find((m) => m.role === 'user')
  if (!userMsg) return

  // 删除该消息之后的所有消息
  chatStore.messages.splice(idx)

  // 重新发送
  messageInput.value = userMsg.content
  handleSend()
}

// 暴露消息容器引用供父组件使用
defineExpose({ messageContainer })

// ===== 员工自助：意图识别 =====

// 从累积的 tool_calls 中提取意图和参数（Function Calling 模式）
// accumulatedToolCalls 格式：{ 0: { function: { name: 'leave_request', arguments: '{"leaveType":"事假",...}' } } }
function extractIntentFromToolCalls(accumulatedToolCalls) {
  console.log('[Employee Intent] extractIntentFromToolCalls 入参:', JSON.stringify(accumulatedToolCalls))
  if (!accumulatedToolCalls || typeof accumulatedToolCalls !== 'object' || Object.keys(accumulatedToolCalls).length === 0) {
    return { intent: null, params: {} }
  }
  for (const key of Object.keys(accumulatedToolCalls)) {
    const tc = accumulatedToolCalls[key]
    try {
      const intent = tc?.function?.name
      const fnArgs = tc?.function?.arguments || ''
      const params = fnArgs ? JSON.parse(fnArgs) : {}
      if (intent) {
        console.log('[Employee Intent] 匹配到意图:', intent, '参数:', params)
        return { intent, params }
      }
    } catch (e) {
      console.warn('[Employee Intent] tool_call 解析失败:', e, tc)
    }
  }
  return { intent: null, params: {} }
}

// 格式化请假时间：若只有日期（YYYY-MM-DD），补充默认时分；若已有时分则原样返回
function formatLeaveTime(dateStr, defaultTime) {
  if (!dateStr) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return `${dateStr} ${defaultTime}`
  }
  return dateStr
}

// 根据后端返回的意图和参数构建卡片消息
function buildCardFromIntent(intent, params, time) {
  switch (intent) {
    case 'leave_request': {
      // 后端返回的日期可能只有 YYYY-MM-DD，补充默认时分
      const startDate = formatLeaveTime(params.startDate, '09:00')
      const endDate = formatLeaveTime(params.endDate || params.startDate, '18:00')
      return {
        role: 'assistant',
        type: 'interactive_card',
        cardType: 'leave_form',
        cardData: {
          type: params.leaveType || '年假',
          startDate,
          endDate,
          reason: params.reason || '',
          status: '待提交',
        },
        time,
        noFeedback: true,
      }
    }
    case 'salary_query': {
      const month = params.queryMonth || params.month || '本月'
      return {
        role: 'assistant',
        type: 'interactive_card',
        cardType: 'salary',
        cardData: {
          month,
          baseSalary: params.baseSalary || '15,000.00',
          performance: params.performance || '3,500.00',
          allowance: params.allowance || '800.00',
          grossSalary: params.grossSalary || '20,500.00',
          socialSecurity: params.socialSecurity || '2,100.00',
          housingFund: params.housingFund || '1,200.00',
          tax: params.tax || '680.00',
          netSalary: params.netSalary || '16,520.00',
        },
        time,
        noFeedback: true,
      }
    }
    case 'personal_info':
      return {
        role: 'assistant',
        type: 'interactive_card',
        cardType: 'profile',
        cardData: {
          staffId: params.员工编号 || params.staff_id || '',
          name: params.姓名 || params.name || '',
          unitName: params.单位 || params.unit_name || '',
          deptName: params.部门 || params.dept_name || '',
          posName: params.岗位 || params.pos_name || '',
          email: params.邮箱 || params.email || '',
          phone: params.手机号 || params.phone || '',
        },
        time,
        noFeedback: true,
      }
    case 'application_records':
      return {
        role: 'assistant',
        type: 'interactive_card',
        cardType: 'records',
        cardData: Array.isArray(params.records) ? params.records : [
          { type: '请假', title: '年假申请', date: '2026-04-10', status: '已通过' },
          { type: '请假', title: '事假申请', date: '2026-04-01', status: '已驳回' },
          { type: '报销', title: '差旅费报销', date: '2026-03-28', status: '审批中' },
          { type: '请假', title: '病假申请', date: '2026-03-15', status: '已通过' },
        ],
        time,
        noFeedback: true,
      }
    case 'annual_assessment': {
      // 触发右侧面板展示考核列表
      if (params.url) {
        fileStore.setShowAssessmentView(params.url)
      }
      return {
        role: 'assistant',
        content: '正在为您查询年度考核项目信息，请查看右侧列表。',
        time,
        noFeedback: true,
      }
    }
    case 'performance_goals':
    default:
      return {
        role: 'assistant',
        content: '未识别到您的意图。您可以尝试输入如"我想请假"、"查看薪酬"、"个人信息"等。',
        time,
        noFeedback: true,
      }
  }
}

// 本地兜底意图识别（接口调用失败时使用）
function detectIntent(content) {
  if (/请假|休假|调休/.test(content)) return 'leave'
  if (/薪酬|工资|工资条/.test(content)) return 'salary'
  if (/个人信息|信息|简历|个人资料/.test(content)) return 'profile'
  if (/记录|申请记录|历史/.test(content)) return 'records'
  if (/年度考核|年度评价/.test(content)) return 'annual_review'
  if (/绩效目标|OKR/.test(content)) return 'performance'
  return 'unknown'
}

// ===== 员工自助：Mock 卡片生成 =====
function generateMockCard(intent) {
  const time = getCurrentTime()

  switch (intent) {
    case 'leave': {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateStr = tomorrow.toISOString().split('T')[0]
      return {
        role: 'assistant',
        type: 'interactive_card',
        cardType: 'leave_form',
        cardData: {
          type: '年假',
          startDate: `${dateStr} 09:00`,
          endDate: `${dateStr} 18:00`,
          reason: '个人事务',
          status: '待提交',
        },
        time,
      }
    }
    case 'salary':
      return {
        role: 'assistant',
        type: 'interactive_card',
        cardType: 'salary',
        cardData: {
          month: '2026年4月',
          baseSalary: '15,000.00',
          performance: '3,500.00',
          allowance: '800.00',
          grossSalary: '20,500.00',
          socialSecurity: '2,100.00',
          housingFund: '1,200.00',
          tax: '680.00',
          netSalary: '16,520.00',
        },
        time,
      }
    case 'profile':
      return {
        role: 'assistant',
        type: 'interactive_card',
        cardType: 'profile',
        cardData: {
          name: '张三',
          dept: '技术研发部',
          position: '高级工程师',
          employeeNo: 'EMP2024001',
          joinDate: '2020-03-15',
          email: 'zhangsan@company.com',
          phone: '138****5678',
        },
        time,
      }
    case 'records':
      return {
        role: 'assistant',
        type: 'interactive_card',
        cardType: 'records',
        cardData: [
          { type: '请假', title: '年假申请', date: '2026-04-10', status: '已通过' },
          { type: '请假', title: '事假申请', date: '2026-04-01', status: '已驳回' },
          { type: '报销', title: '差旅费报销', date: '2026-03-28', status: '审批中' },
          { type: '请假', title: '病假申请', date: '2026-03-15', status: '已通过' },
        ],
        time,
      }
    case 'annual_review':
    case 'performance':
      return {
        role: 'assistant',
        content: '该功能正在开发中，敬请期待。',
        time,
        noFeedback: true,
      }
    default:
      return {
        role: 'assistant',
        content: '未识别到您的意图。您可以尝试输入如"我想请假"、"查看薪酬"、"个人信息"等。',
        time,
        noFeedback: true,
      }
  }
}

// ===== 员工自助：卡片操作处理 =====
function handleCardAction(message, payload) {
  if (payload?.action === 'confirm_leave') {
    chatStore.addMessage({
      role: 'assistant',
      content: '请假申请已提交成功。',
      time: getCurrentTime(),
      noFeedback: true,
    })
  } else if (payload?.action === 'cancel') {
    chatStore.addMessage({
      role: 'assistant',
      content: '已取消操作。',
      time: getCurrentTime(),
      noFeedback: true,
    })
  } else if (payload?.action === 'open_assessment' && payload.url) {
    fileStore.setShowAssessmentView(payload.url)
    scrollToBottom()
    return
  }
  scrollToBottom()
}

function handleFileAction(message) {
  emit('file-action', message)
}
</script>

<template>
  <div class="chatbot">
    <!-- 消息列表 -->
    <div ref="messageContainer" class="message-container">
      <!-- 空状态 -->
      <div v-if="chatStore.messages.length === 0" class="empty-state">
        <div class="empty-greeting">{{ greeting }}</div>
      </div>

      <!-- 消息列表 -->
      <div v-for="(msg, idx) in chatStore.messages" :key="idx" class="message-item">
        <MessageBubble
          :message="msg"
          :streaming="chatStore.isStreaming"
          @like="handleLike"
          @dislike="handleDislike"
          @regenerate="handleRegenerate"
          @file-action="handleFileAction"
          @card-action="handleCardAction"
        />
      </div>

      <!-- 流式回复中 -->
      <div v-if="chatStore.isStreaming && chatStore.currentStreamContent" class="message-item">
        <div class="message-bubble assistant">
          <div class="bubble-content ai-content markdown-body" v-html="streamingHtml" />
          <div class="typing-indicator">
            <span class="dot" />
            <span class="dot" />
            <span class="dot" />
          </div>
        </div>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-area">
      <!-- 快捷操作下拉菜单 -->
      <div class="mode-selector" @click.stop>
        <button class="mode-selector-trigger" :class="{ open: showDropdown }" @click="toggleDropdown">
          <span>{{ getCurrentModeLabel() }}</span>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <div v-if="showDropdown" class="mode-dropdown">
          <div
            v-for="action in quickActions"
            :key="action.mode"
            class="mode-dropdown-item"
            :class="{ active: modeStore.currentMode === action.mode }"
            @click="handleQuickAction(action)"
          >
            <span>{{ action.label }}</span>
            <svg v-if="modeStore.currentMode === action.mode" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>
      </div>

      <!-- 输入框和发送 -->
      <div class="input-row">
        <!-- 上传按钮（仅文件转换模式显示） -->
        <button
          v-if="modeStore.currentMode === modeStore.MODES.FILE_CONVERT"
          class="tool-btn"
          title="上传文件"
          @click="$emit('upload-click')"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </button>
        <!-- 语音输入按钮（始终显示） -->
        <button
          class="tool-btn"
          :class="{ active: isVoiceRecording }"
          title="语音输入"
          @click="toggleVoice"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </button>
        <textarea
          v-model="messageInput"
          class="input-box"
          placeholder="输入消息..."
          :disabled="chatStore.isStreaming"
          @keydown="handleKeydown"
          rows="1"
        />
        <button
          v-if="!chatStore.isStreaming"
          class="send-btn"
          :disabled="!messageInput.trim()"
          @click="handleSend"
        >
          发送
        </button>
        <button v-else class="stop-btn" @click="handleStop">
          停止
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chatbot {
  display: flex;
  flex-direction: column;
  height: 100%;
  flex: 1;
  min-width: 0;
}

.message-container {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.empty-greeting {
  font-size: 16px;
  color: #666;
  text-align: center;
  line-height: 1.6;
}

.message-item {
  margin-bottom: 4px;
}

/* 打字机加载动画 */
.typing-indicator {
  display: inline-flex;
  gap: 4px;
  padding: 4px 0;
}

.typing-indicator .dot {
  width: 6px;
  height: 6px;
  background: #409eff;
  border-radius: 50%;
  animation: typing 1.2s infinite;
}

.typing-indicator .dot:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-indicator .dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-4px); opacity: 1; }
}

/* 输入区域 */
.input-area {
  border-top: 1px solid #eee;
  padding: 12px;
  background: #fff;
}

/* 模式选择下拉菜单 */
.mode-selector {
  position: relative;
  margin-bottom: 10px;
  width: fit-content;
}

.mode-selector-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 6px;
  font-size: 13px;
  color: #666;
  cursor: pointer;
  transition: all 0.15s;
}

.mode-selector-trigger:hover {
  border-color: #409eff;
  color: #409eff;
}

.mode-selector-trigger.open {
  border-color: #409eff;
  color: #409eff;
}

.mode-selector-trigger svg {
  transition: transform 0.2s;
}

.mode-selector-trigger.open svg {
  transform: rotate(180deg);
}

.mode-dropdown {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  min-width: 160px;
  padding: 4px;
  z-index: 100;
}

.mode-dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 13px;
  color: #333;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.mode-dropdown-item:hover {
  background: #f5f7fa;
}

.mode-dropdown-item.active {
  background: #ecf5ff;
  color: #409eff;
}

.input-row {
  display: flex;
  gap: 6px;
  align-items: flex-end;
}

/* 工具按钮（上传/语音） */
.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  background: #f5f5f5;
  border-radius: 8px;
  cursor: pointer;
  color: #666;
  flex-shrink: 0;
  transition: all 0.15s;
}

.tool-btn:hover {
  background: #e8e8e8;
  color: #409eff;
}

.tool-btn.active {
  background: #f56c6c;
  color: #fff;
  animation: voice-pulse 1.2s infinite;
}

@keyframes voice-pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

.input-box {
  flex: 1;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 14px;
  resize: none;
  outline: none;
  min-height: 36px;
  max-height: 100px;
  font-family: inherit;
  line-height: 1.5;
}

.input-box:focus {
  border-color: #409eff;
}

.input-box:disabled {
  background: #f5f5f5;
  color: #999;
}

.send-btn {
  background: #409eff;
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}

.send-btn:hover {
  background: #3a8ee6;
}

.send-btn:disabled {
  background: #a0cfff;
  cursor: not-allowed;
}

.stop-btn {
  background: #f56c6c;
  color: #fff;
  border: none;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}

.stop-btn:hover {
  background: #e04c4c;
}
</style>
