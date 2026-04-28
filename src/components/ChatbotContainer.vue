<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { useChatStore } from '../stores/chat'
import { useSessionStore } from '../stores/session'
import { useFileStore } from '../stores/file'
import { useModeStore } from '../stores/mode'
import { confirmFileData, batchParseFiles, retryParseFile } from '../api/file'
import normalizeExtractData from '../utils/normalizeExtractData'
import getConfig from '../config/index'
import SessionList from './SessionList.vue'
import Chatbot from './Chatbot.vue'
import FileUpload from './FileUpload.vue'
import FilePreview from './FilePreview.vue'

const chatStore = useChatStore()
const sessionStore = useSessionStore()
const fileStore = useFileStore()
const modeStore = useModeStore()

const visible = ref(false)
const isMaximized = ref(false)
const showSidebar = ref(false)

const config = getConfig()

// 状态映射：SSE 推送状态 → 用户可读提示
const STATUS_MESSAGES = {
  parsing: '正在解析文件内容...',
  success: '文件解析完成',
  failed: '文件解析失败',
}

// 初始化：加载会话列表
onMounted(async () => {
  visible.value = true
  await sessionStore.init()
  // 加载第一个会话的历史消息
  if (sessionStore.currentSessionId) {
    const history = await sessionStore.loadHistory(sessionStore.currentSessionId)
    if (history && history.length > 0) {
      chatStore.loadHistoryMessages(history)
    }
  }
})

// 监听 previewMode 自动最大化
watch(() => fileStore.activePreviewFileId, (val) => {
  isMaximized.value = !!val
})

// 监听文件转换模式切换
watch(() => modeStore.currentMode, (mode) => {
  if (mode === modeStore.MODES.FILE_CONVERT) {
    // 在聊天流中添加上传引导消息
    chatStore.addMessage({
      role: 'assistant',
      content: '已进入文件转换模式。请上传需要转换的文件：',
      time: getCurrentTime(),
      noFeedback: true,
    })
    chatStore.addMessage({
      role: 'assistant',
      type: 'file_upload',
      uploadPrompt: true,
    })
    scrollToBottom()
    isMaximized.value = true
    showSidebar.value = true
  }
})

// 最大化时自动展开侧边栏，还原时收起
watch(isMaximized, (val) => {
  if (modeStore.currentMode !== modeStore.MODES.FILE_CONVERT) {
    showSidebar.value = val
  }
})

function getCurrentTime() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function scrollToBottom() {
  nextTick(() => {
    const container = document.querySelector('.message-container')
    if (container) container.scrollTop = container.scrollHeight
  })
}

function toggle() {
  visible.value = !visible.value
}

function toggleMaximize() {
  isMaximized.value = !isMaximized.value
}

function toggleSidebar() {
  showSidebar.value = !showSidebar.value
}

async function handleNewSession() {
  chatStore.clearMessages()
  const session = await sessionStore.createSession('新会话')
  if (!session) return
  if (!isMaximized.value) {
    showSidebar.value = false
  }
}

async function handleSelectSession(id) {
  sessionStore.switchSession(id)
  chatStore.clearMessages()
  // 加载该会话的历史消息
  const history = await sessionStore.loadHistory(id)
  if (history && history.length > 0) {
    chatStore.loadHistoryMessages(history)
  }
  if (!isMaximized.value) {
    showSidebar.value = false
  }
}

async function handleDeleteSession(id) {
  await sessionStore.deleteSession(id)
  chatStore.clearMessages()
}

// 上传完成 → 创建文件列表消息，调用批量解析 SSE 流
function handleUploadComplete(result) {
  const { uploaded, rejected } = result
  if (uploaded.length === 0) return

  // 创建 file_list 消息
  const fileListMsg = {
    role: 'assistant',
    type: 'file_list',
    files: uploaded.map((f, idx) => ({
      index: idx + 1,
      fileId: `file-${idx + 1}`,
      fileName: f.fileName,
      ossUrl: f.ossUrl,
      uploadTime: new Date().toLocaleString('zh-CN'),
      status: 'parsing',
      fileStatus: 'parsing',
      statusMessage: '已上传，准备解析...',
      extractedData: null,
      isExtracting: true,
      extractError: '',
    })),
    rejected: rejected || [],
    time: getCurrentTime(),
    noFeedback: true,
  }
  chatStore.addMessage(fileListMsg)

  // 同步到 fileStore
  uploaded.forEach((f, idx) => {
    fileStore.addFileRecord({
      fileId: `file-${idx + 1}`,
      fileName: f.fileName,
      ossUrl: f.ossUrl,
      fileStatus: 'uploading',
      statusMessage: '已上传，准备解析...',
    })
  })

  // 调用批量解析 SSE 流
  startBatchParse(fileListMsg)
  scrollToBottom()
}

// 批量解析文件（SSE 流）
let currentParseController = null

function startBatchParse(fileListMsg) {
  const parseFiles = fileListMsg.files.map((f) => ({
    index: f.index,
    fileName: f.fileName,
    ossUrl: f.ossUrl,
  }))

  updateFileInMessage(fileListMsg, null, {
    fileStatus: 'parsing',
    statusMessage: '正在解析文件内容...',
  })

  currentParseController = batchParseFiles(parseFiles, {
    onFile: (data) => {
      const { index, fileName, success, structuredData, errorMessage } = data
      const fileItem = fileListMsg.files.find((f) => f.index === index)
      if (!fileItem) return

      if (success) {
        const normalizedData = normalizeExtractData(structuredData)
        updateFileInMessage(fileListMsg, fileItem.fileId, {
          status: 'extracted',
          fileStatus: 'success',
          statusMessage: '文件解析完成',
          extractedData: normalizedData,
          isExtracting: false,
        })
        const record = fileStore.getFileRecord(fileItem.fileId)
        if (record) {
          fileStore.updateFileRecord(fileItem.fileId, {
            fileStatus: 'success',
            statusMessage: '文件解析完成',
            extractedData: normalizedData,
            isExtracting: false,
          })
        }
      } else {
        updateFileInMessage(fileListMsg, fileItem.fileId, {
          status: 'failed',
          fileStatus: 'failed',
          statusMessage: '解析失败',
          isExtracting: false,
          extractError: errorMessage || '解析失败',
        })
        fileStore.updateFileRecord(fileItem.fileId, {
          fileStatus: 'failed',
          statusMessage: '解析失败',
          isExtracting: false,
          extractError: errorMessage || '解析失败',
        })
      }
      scrollToBottom()
    },
    onDone: () => {
      // done 事件到了，但可能还有文件没收到 file 事件（解析失败或被跳过）
      // 标记所有仍在解析中的文件为失败
      fileListMsg.files.forEach((f) => {
        if (f.status === 'uploading' || f.fileStatus === 'parsing') {
          updateFileInMessage(fileListMsg, f.fileId, {
            status: 'failed',
            fileStatus: 'failed',
            statusMessage: '解析失败',
            isExtracting: false,
            extractError: '未收到解析结果',
          })
          fileStore.updateFileRecord(f.fileId, {
            fileStatus: 'failed',
            statusMessage: '解析失败',
            isExtracting: false,
            extractError: '未收到解析结果',
          })
        }
      })
      currentParseController = null
      scrollToBottom()
    },
    onError: (err) => {
      // 标记所有仍在解析中的文件为失败
      fileListMsg.files.forEach((f) => {
        if (f.status === 'uploading' || f.fileStatus === 'parsing') {
          updateFileInMessage(fileListMsg, f.fileId, {
            status: 'failed',
            fileStatus: 'failed',
            statusMessage: '解析失败',
            isExtracting: false,
            extractError: err.message || '解析请求异常',
          })
          fileStore.updateFileRecord(f.fileId, {
            fileStatus: 'failed',
            statusMessage: '解析失败',
            isExtracting: false,
            extractError: err.message || '解析请求异常',
          })
        }
      })
      currentParseController = null
      scrollToBottom()
    },
  })
}

// 单文件重试解析
function handleFileRetry(file) {
  if (!file.ossUrl) return
  updateFileInMessage(null, file.fileId, {
    status: 'uploading',
    fileStatus: 'parsing',
    statusMessage: '正在重新解析...',
    isExtracting: true,
    extractError: '',
  })
  fileStore.updateFileRecord(file.fileId, {
    fileStatus: 'parsing',
    statusMessage: '正在重新解析...',
    isExtracting: true,
    extractError: '',
  })

  retryParseFile(
    { index: file.index || 1, fileName: file.fileName, ossUrl: file.ossUrl },
    {
      onFile: (data) => {
        const { success, structuredData, errorMessage } = data
        if (success) {
          const normalizedData = normalizeExtractData(structuredData)
          updateFileInMessage(null, file.fileId, {
            status: 'extracted',
            fileStatus: 'success',
            statusMessage: '文件解析完成',
            extractedData: normalizedData,
            isExtracting: false,
          })
          fileStore.updateFileRecord(file.fileId, {
            fileStatus: 'success',
            statusMessage: '文件解析完成',
            extractedData: normalizedData,
            isExtracting: false,
          })
        } else {
          updateFileInMessage(null, file.fileId, {
            status: 'failed',
            fileStatus: 'failed',
            statusMessage: '解析失败',
            isExtracting: false,
            extractError: errorMessage || '解析失败',
          })
          fileStore.updateFileRecord(file.fileId, {
            fileStatus: 'failed',
            statusMessage: '解析失败',
            isExtracting: false,
            extractError: errorMessage || '解析失败',
          })
        }
        scrollToBottom()
      },
      onDone: () => {},
      onError: (err) => {
        updateFileInMessage(null, file.fileId, {
          status: 'failed',
          fileStatus: 'failed',
          statusMessage: '解析失败',
          isExtracting: false,
          extractError: err.message || '重试异常',
        })
        fileStore.updateFileRecord(file.fileId, {
          fileStatus: 'failed',
          statusMessage: '解析失败',
          isExtracting: false,
          extractError: err.message || '重试异常',
        })
        scrollToBottom()
      },
    },
  )
}

// 更新 file_list 消息中指定文件的状态
function updateFileInMessage(fileListMsg, fileId, updates) {
  // 如果没传 fileListMsg，自动查找最近的一条 file_list 消息
  const targetMsg = fileListMsg || chatStore.messages.value.slice().reverse().find((m) => m.type === 'file_list')
  if (!targetMsg?.files) return
  const file = targetMsg.files.find((f) => f.fileId === fileId)
  if (file) {
    Object.assign(file, updates)
  }
}

// 确认提交单个文件
async function handleConfirmSingle(data) {
  try {
    const record = fileStore.activeFileRecord
    if (record) {
      await confirmFileData({ ...data, fileId: record.fileId })
      // 更新消息中的状态
      const fileListMsg = chatStore.messages.value.slice().reverse().find((m) => m.type === 'file_list')
      if (fileListMsg) {
        updateFileInMessage(fileListMsg, record.fileId, { status: 'submitted' })
      }
    }
    fileStore.clearActivePreview()
  } catch (err) {
    console.error('[Confirm Error]', err)
    fileStore.updateFileRecord(fileStore.activePreviewFileId, {
      extractError: '提交失败：' + (err.message || ''),
    })
  }
}

// 确认提交全部文件
async function handleConfirmAll(message) {
  try {
    for (const file of message.files) {
      if (file.extractedData) {
        await confirmFileData({ ...file.extractedData, fileId: file.fileId })
        updateFileInMessage(message, file.fileId, { status: 'submitted' })
        fileStore.updateFileRecord(file.fileId, { status: 'submitted' })
      }
    }
    fileStore.clearActivePreview()
    chatStore.addMessage({
      role: 'assistant',
      content: '全部文件已提交成功。',
      time: getCurrentTime(),
      noFeedback: true,
    })
    modeStore.switchMode(modeStore.MODES.CUSTOMER_SERVICE)
    scrollToBottom()
  } catch (err) {
    console.error('[ConfirmAll Error]', err)
    chatStore.addMessage({
      role: 'system',
      content: '部分文件提交失败：' + (err.message || ''),
      time: getCurrentTime(),
    })
  }
}

// 取消预览
function handleCancelPreview() {
  fileStore.clearActivePreview()
}

// 取消上传
function handleCancelUpload() {
  // 中断正在进行的解析
  if (currentParseController) {
    currentParseController.abort()
    currentParseController = null
  }
  fileStore.fullReset()
  modeStore.switchMode(modeStore.MODES.CUSTOMER_SERVICE)
}

// 文件列表操作
function handleFileAction(action) {
  if (action.type === 'upload-complete') {
    handleUploadComplete(action.result)
  } else if (action.type === 'cancel-upload') {
    handleCancelUpload()
  } else if (action.type === 'file-click') {
    const file = action.file
    if (file.status === 'extracted' && file.extractedData) {
      // 打开预览
      fileStore.setActivePreviewFileId(file.fileId)
      isMaximized.value = true
    } else if (file.extractError) {
      // 重新解析
      handleFileRetry(file)
    }
  } else if (action.type === 'confirm-all') {
    handleConfirmAll(action.message)
  } else if (action.type === 'file_upload' || !action.type) {
    // 兼容旧的 file_upload 消息点击（重新上传）
    const msg = action.message || action
    if (msg?.type === 'file_upload' && msg.status === 'uploaded') {
      const idx = chatStore.messages.value.indexOf(msg)
      if (idx >= 0) {
        chatStore.messages.value.splice(idx + 1)
      }
      modeStore.switchMode(modeStore.MODES.FILE_CONVERT)
    }
  }
}

// 计算当前正在预览的文件数据
const activeFileData = computed(() => {
  if (!fileStore.activePreviewFileId) return null
  const record = fileStore.getFileRecord(fileStore.activePreviewFileId)
  return record?.extractedData || null
})

const activeFileName = computed(() => {
  if (!fileStore.activePreviewFileId) return ''
  const record = fileStore.getFileRecord(fileStore.activePreviewFileId)
  return record?.fileName || ''
})
</script>

<template>
  <div
    v-if="visible"
    class="chatbot-container"
    :class="{ 'is-maximized': isMaximized }"
  >
    <!-- 聊天窗口头部 -->
    <div class="chatbot-header">
      <div class="header-left">
        <button class="sidebar-toggle" @click="toggleSidebar">
          {{ showSidebar ? '收起' : '会话' }}
        </button>
        <span class="chatbot-title">AI 助手</span>
      </div>
      <div class="header-actions">
        <button class="action-btn" @click="toggleMaximize">
          {{ isMaximized ? '还原' : '放大' }}
        </button>
        <button class="action-btn" @click="toggle">关闭</button>
      </div>
    </div>

    <!-- 主体区域 -->
    <div class="main-content">
      <!-- 遮罩层（非最大化时，会话列表为覆盖式，点击关闭） -->
      <div
        v-if="showSidebar && !isMaximized"
        class="sidebar-backdrop"
        @click="showSidebar = false"
      />
      <!-- 会话列表侧边栏 -->
      <SessionList
        v-if="showSidebar"
        class="sidebar-overlay"
        :class="{ 'sidebar-fixed': isMaximized }"
        :active-id="sessionStore.currentSessionId"
        @new="handleNewSession"
        @select="handleSelectSession"
        @delete="handleDeleteSession"
      />

      <!-- 始终展示的内容区（聊天 + 可选的文件预览） -->
      <div class="content-body">
        <!-- 聊天核心组件（始终存在） -->
        <div class="chat-area-wrapper">
          <Chatbot @file-action="handleFileAction" />
        </div>
        <!-- 文件预览编辑组件（有数据时才展示，与聊天区左右分屏） -->
        <div v-if="fileStore.activePreviewFileId && activeFileData" class="preview-area">
          <FilePreview
            :data="activeFileData"
            @confirm="handleConfirmSingle"
            @cancel="handleCancelPreview"
          />
        </div>
      </div>
    </div>
  </div>

  <!-- 悬浮球按钮（聊天窗口关闭时显示） -->
  <div v-else class="chatbot-ball" @click="toggle">
    AI
  </div>
</template>

<style scoped>
.chatbot-container {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: 380px;
  height: 520px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  z-index: 9999;
  overflow: hidden;
  transition: all 0.3s ease;
}

.chatbot-container.is-maximized {
  width: 90vw;
  height: 90vh;
  right: 5vw;
  bottom: 5vh;
}

.chatbot-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: #409eff;
  color: #fff;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sidebar-toggle {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: #fff;
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.sidebar-toggle:hover {
  background: rgba(255, 255, 255, 0.3);
}

.chatbot-title {
  font-size: 16px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  background: rgba(255, 255, 255, 0.2);
  border: none;
  color: #fff;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.3);
}

.main-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  position: relative;
  min-width: 0;
}

.sidebar-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.3);
  z-index: 9;
}

.sidebar-overlay {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 10;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
}

.sidebar-overlay.sidebar-fixed {
  position: relative;
  box-shadow: none;
  border-right: 1px solid #eee;
}

.sidebar-overlay.sidebar-fixed {
  z-index: 25;
}

/* 始终展示的内容区（聊天 + 可选的文件预览） */
.content-body {
  flex: 1;
  display: flex;
  min-width: 0;
  overflow: hidden;
}

/* 聊天区域居中 wrapper */
.chat-area-wrapper {
  flex: 1;
  display: flex;
  justify-content: center;
  min-width: 0;
  overflow: hidden;
}

.chat-area-wrapper .chatbot {
  max-width: 720px;
  width: 100%;
}

/* 最大化时增大消息最大宽度 */
.chatbot-container.is-maximized .chat-area-wrapper .chatbot {
  max-width: 800px;
}

/* 有文件预览时，聊天和预览左右分屏 */
.content-body:has(.preview-area) .chat-area-wrapper .chatbot {
  max-width: none;
}

/* 文件预览区域 */
.preview-area {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  border-left: 1px solid #eee;
}

.chatbot-ball {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: #409eff;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(64, 158, 255, 0.4);
  transition: transform 0.2s;
  z-index: 9999;
}

.chatbot-ball:hover {
  transform: scale(1.1);
}

@media (max-width: 480px) {
  .chatbot-container:not(.is-maximized) {
    width: 100vw;
    height: 100vh;
    right: 0;
    bottom: 0;
    border-radius: 0;
  }
}
</style>
