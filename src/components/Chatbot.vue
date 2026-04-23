<script setup>
import { ref, nextTick, computed, onMounted, watch } from 'vue'
import { useChatStore } from '../stores/chat'
import { useModeStore } from '../stores/mode'
import { useSessionStore } from '../stores/session'
import { createStreamRequest } from '../utils/stream'
import { renderMarkdown } from '../utils/markdown'
import MessageBubble from './MessageBubble.vue'

const emit = defineEmits(['file-action'])
const chatStore = useChatStore()
const modeStore = useModeStore()
const sessionStore = useSessionStore()

const messageInput = ref('')
const messageContainer = ref(null)

const config = window.CHATBOT_CONFIG || {}
const quickActions = config.quickActions || [
  { label: '人才发展', mode: 'talent_agent' },
  { label: '文件转换', mode: 'file_convert' },
  { label: '员工自助', mode: 'employee_self' },
]
const greeting = config.greeting || '你好！我是 AI 助手，有什么可以帮助你的吗？'

const streamingHtml = computed(() => renderMarkdown(chatStore.currentStreamContent))

// 初始化会话（由父组件 ChatbotContainer 负责加载）
onMounted(() => {
  // 会话列表已由父组件初始化
})

// 监听历史消息加载完成，滚动到底部
watch(() => chatStore.messages.length, (newLen) => {
  if (newLen > 0) {
    scrollToBottom()
  }
})

// 监听模式切换，发送入口/退出提示
watch(() => modeStore.currentMode, (mode, prevMode) => {
  if (mode === modeStore.MODES.EMPLOYEE_SELF) {
    chatStore.addMessage({
      role: 'assistant',
      content: '已进入员工自助模式。您可以告诉我需要什么帮助，例如：请假申请、薪酬查询、个人信息、申请记录、年度考核、绩效目标等。',
      time: getCurrentTime(),
      noFeedback: true,
    })
    scrollToBottom()
  } else if (prevMode === modeStore.MODES.EMPLOYEE_SELF) {
    chatStore.addMessage({
      role: 'system',
      content: '已退出员工自助模式，恢复为客服模式。',
      time: getCurrentTime(),
    })
    scrollToBottom()
  } else if (mode === modeStore.MODES.TALENT_AGENT) {
    chatStore.addMessage({
      role: 'assistant',
      content: '已进入人才发展模式。请描述您的岗位需求或人员信息，我将为您推荐匹配的人才或岗位建议。',
      time: getCurrentTime(),
      noFeedback: true,
    })
    scrollToBottom()
  } else if (prevMode === modeStore.MODES.TALENT_AGENT) {
    chatStore.addMessage({
      role: 'system',
      content: '已退出人才发展模式，恢复为客服模式。',
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

  // 员工自助模式：拦截请求，使用意图识别 + mock 响应
  if (modeStore.currentMode === modeStore.MODES.EMPLOYEE_SELF) {
    console.log('[Chatbot] 员工自助模式拦截，intent检测:', content)
    const intent = detectIntent(content)
    console.log('[Chatbot] detected intent:', intent)
    const card = generateMockCard(intent)
    console.log('[Chatbot] generated card:', card)
    chatStore.addMessage(card)
    scrollToBottom()
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
  const isAgentMode = modeStore.currentMode === modeStore.MODES.TALENT_AGENT
  const apiUrl = window.CHATBOT_CONFIG?.baseUrl ?? ''
  const url = isAgentMode
    ? `${apiUrl}/ai/api/person/post/match`
    : `${apiUrl}/ai/api/chatbot/chat`

  console.log('[Chatbot] Request URL:', url)
  console.log('[Chatbot] Request body:', JSON.stringify({ prompt: content, sessionId: sessionStore.currentSessionId, chatSessionId: sessionStore.currentSessionId }))

  const controller = createStreamRequest(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: content,
        sessionId: sessionStore.currentSessionId,
        chatSessionId: sessionStore.currentSessionId,
      }),
    },
    {
      onChunk(data) {
        let text = ''
        if (typeof data === 'string') {
          text = data
        } else if (data.output?.text !== undefined) {
          // 后端返回 { output: { text: '增量文本' } } 格式
          text = data.output.text
        } else {
          text = data.content || data.text || data.delta || ''
        }
        chatStore.appendStreamContent(text)
        scrollToBottom()
      },
      onDone() {
        if (chatStore.currentStreamContent) {
          chatStore.addMessage({
            role: 'assistant',
            content: chatStore.currentStreamContent,
            time: getCurrentTime(),
          })
          chatStore.setStreamContent('')
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
      <!-- 快捷操作按钮 -->
      <div class="quick-actions">
        <button
          v-for="action in quickActions"
          :key="action.mode"
          class="action-btn"
          :class="{ active: modeStore.currentMode === action.mode }"
          @click="handleQuickAction(action)"
        >
          {{ action.label }}
        </button>
      </div>

      <!-- 输入框和发送 -->
      <div class="input-row">
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

.quick-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
  flex-wrap: wrap;
}

.action-btn {
  padding: 4px 12px;
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 14px;
  font-size: 12px;
  color: #666;
  cursor: pointer;
  transition: all 0.15s;
}

.action-btn:hover {
  border-color: #409eff;
  color: #409eff;
}

.action-btn.active {
  background: #409eff;
  border-color: #409eff;
  color: #fff;
}

.input-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
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
