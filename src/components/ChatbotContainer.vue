<script setup>
import { ref, onMounted, watch } from 'vue'
import { useChatStore } from '../stores/chat'
import { useSessionStore } from '../stores/session'
import { useFileStore } from '../stores/file'
import { useModeStore } from '../stores/mode'
import { extractFileContent, confirmFileData, getFileStatus } from '../api/file'
import { extractJsonFromMarkdown } from '../utils/jsonParser'
import normalizeExtractData from '../utils/normalizeExtractData'
import mockExtractData from '../mock/extractData'
import getConfig from '../config/index'
import SessionList from './SessionList.vue'
import Chatbot from './Chatbot.vue'
import FileUpload from './FileUpload.vue'
import FileExtractStatus from './FileExtractStatus.vue'
import FilePreview from './FilePreview.vue'

const chatStore = useChatStore()
const sessionStore = useSessionStore()
const fileStore = useFileStore()
const modeStore = useModeStore()

const visible = ref(false)
const isMaximized = ref(false)
const showSidebar = ref(false)
const showUploadPanel = ref(false)

const config = getConfig()
const isMockMode = config.mockExtract

onMounted(() => {
  visible.value = true
})

// 监听 previewMode 自动最大化
watch(() => fileStore.previewMode, (val) => {
  isMaximized.value = val
})

// 监听文件转换模式切换
watch(() => modeStore.currentMode, (mode) => {
  if (mode === modeStore.MODES.FILE_CONVERT) {
    showUploadPanel.value = true
    // 进入文件转换模式时自动最大化，并同时展开侧边栏
    isMaximized.value = true
    showSidebar.value = true
  } else {
    showUploadPanel.value = false
  }
})

// 最大化时自动展开侧边栏，还原时收起
watch(isMaximized, (val) => {
  // 只在非文件转换模式下才响应（文件转换模式已显式处理）
  if (modeStore.currentMode !== modeStore.MODES.FILE_CONVERT) {
    showSidebar.value = val
  }
})

function toggle() {
  visible.value = !visible.value
}

function toggleMaximize() {
  isMaximized.value = !isMaximized.value
}

function toggleSidebar() {
  showSidebar.value = !showSidebar.value
}

function handleNewSession() {
  chatStore.clearMessages()
  sessionStore.createSession()
  if (!isMaximized.value) {
    showSidebar.value = false
  }
}

function handleSelectSession(id) {
  sessionStore.switchSession(id)
  chatStore.clearMessages()
  // TODO: 加载该会话的历史消息
  if (!isMaximized.value) {
    showSidebar.value = false
  }
}

function handleDeleteSession(id) {
  sessionStore.deleteSession(id)
  chatStore.clearMessages()
}

// 状态映射：后端返回状态 → 用户可读提示
const STATUS_MESSAGES = {
  INIT: '文件已上传，等待解析...',
  PARSING: '正在解析文件内容...',
  PARSE_SUCCESS: '文件解析完成，准备提取...',
  SAFE_CHECKING: '正在进行安全检测...',
  SAFE_CHECK_FAILED: '安全检测失败',
  INDEX_BUILDING: '正在构建索引...',
  INDEX_BUILD_SUCCESS: '索引构建完成，准备提取...',
  INDEX_BUILDING_FAILED: '索引构建失败',
  FILE_IS_READY: '文件准备就绪，开始提取内容...',
  FILE_EXPIRED: '文件已过期',
  INDEX_DELETED: '文件索引已删除',
  PARSE_FAILED: '文件解析失败',
}

// 表示文件已就绪、可以继续处理的状态
const READY_STATUSES = ['FILE_IS_READY', 'PARSE_SUCCESS', 'INDEX_BUILD_SUCCESS']
// 表示失败的终态
const FAILED_STATUSES = ['PARSE_FAILED', 'SAFE_CHECK_FAILED', 'INDEX_BUILDING_FAILED', 'FILE_EXPIRED', 'INDEX_DELETED']

// 上传完成 → 记录到聊天 + 开始轮询文件状态
function handleUploadComplete(fileId, fileName) {
  // 关闭上传面板，后续由状态轮询接管
  showUploadPanel.value = false

  fileStore.setFileId(fileId)

  // 添加文件上传记录到聊天消息
  const uploadRecord = {
    role: 'file_upload',
    type: 'file_upload',
    fileId,
    fileName,
    uploadTime: new Date().toLocaleString('zh-CN'),
    status: 'uploaded', // uploaded -> extracted
  }
  chatStore.addMessage(uploadRecord)
  fileStore.addFileRecord({ fileId, fileName })

  waitForFileReady(fileId)
}

// 轮询文件状态，直到就绪或失败
function waitForFileReady(fileId, maxRetries = 60, interval = 2000) {
  let retries = 0

  fileStore.setStatusMessage('正在检查文件状态...')

  const pollTimer = setInterval(async () => {
    retries++

    try {
      const status = await getFileStatus(fileId)
      console.log('[FileStatus] Poll', retries, '- status:', status)

      // 后端直接返回状态字符串
      const normalizedStatus = typeof status === 'string' ? status.trim() : String(status)

      fileStore.setFileStatus(normalizedStatus)
      fileStore.setStatusMessage(STATUS_MESSAGES[normalizedStatus] || `文件处理中: ${normalizedStatus}`)

      // 已就绪，开始提取
      if (READY_STATUSES.includes(normalizedStatus)) {
        clearInterval(pollTimer)
        startExtraction(fileId)
        return
      }

      // 失败终态
      if (FAILED_STATUSES.includes(normalizedStatus)) {
        clearInterval(pollTimer)
        fileStore.setExtracting(false)
        fileStore.setExtractError(STATUS_MESSAGES[normalizedStatus] || `文件处理失败: ${normalizedStatus}`)
        return
      }

      // 超时
      if (retries >= maxRetries) {
        clearInterval(pollTimer)
        fileStore.setExtracting(false)
        fileStore.setExtractError('文件处理超时，请稍后重试')
      }
    } catch (err) {
      console.error('[FileStatus] Poll error:', err)
      // 静默重试，不立即失败
    }
  }, interval)
}

// 开始提取文件内容
function startExtraction(fileId) {
  fileStore.setExtracting(true)
  fileStore.setExtractError('')
  fileStore.setStatusMessage('正在提取文件内容...')

  // 模拟模式：直接使用本地 mock 数据
  if (isMockMode) {
    console.log('[Mock] Using mock extract data')
    setTimeout(() => {
      fileStore.setExtractedData(normalizeExtractData(mockExtractData))
      fileStore.setExtracting(false)
      fileStore.setStatusMessage('')

      // 标记文件记录为已提取
      const lastUploadRecord = chatStore.messages.slice().reverse().find(m => m.type === 'file_upload')
      if (lastUploadRecord) {
        lastUploadRecord.status = 'extracted'
      }

      fileStore.setPreviewMode(true)
    }, 800)
    return
  }

  let extractedText = ''

  const controller = extractFileContent(
    fileId,
    {
      onChunk(data) {
        let text = ''
        if (typeof data === 'string') {
          text = data
        } else if (data.output?.text !== undefined) {
          text = data.output.text
        } else {
          text = data.content || data.text || data.delta || ''
        }

        // 累计提取文本
        extractedText += text

        // 尝试解析 JSON
        const parsed = extractJsonFromMarkdown(extractedText)
        if (parsed) {
          fileStore.setExtractedData(normalizeExtractData(parsed))
        }
      },
      onDone() {
        // 提取完成，如果还没解析成功，最后尝试一次
        if (!fileStore.extractedData && extractedText) {
          const parsed = extractJsonFromMarkdown(extractedText)
          if (parsed) {
            fileStore.setExtractedData(normalizeExtractData(parsed))
          }
        }
        fileStore.setExtracting(false)
        fileStore.setStatusMessage('')

        // 标记文件记录为已提取
        const lastUploadRecord = chatStore.messages.slice().reverse().find(m => m.type === 'file_upload')
        if (lastUploadRecord) {
          lastUploadRecord.status = 'extracted'
        }

        // 进入预览模式
        if (fileStore.extractedData) {
          fileStore.setPreviewMode(true)
        }
      },
      onError(err) {
        console.error('[Extract Error]', err)
        fileStore.setExtracting(false)
        fileStore.setExtractError(err.message || '提取失败')
      },
    },
  )

  // 存储 controller 用于中断
  fileStore.extractController = controller
}

// 确认提交数据
async function handleConfirmData(data) {
  try {
    await confirmFileData(data)
    // 提交成功，退出预览模式
    fileStore.setPreviewMode(false)
    showUploadPanel.value = false
    modeStore.switchMode(modeStore.MODES.CUSTOMER_SERVICE)
  } catch (err) {
    console.error('[Confirm Error]', err)
    fileStore.setExtractError('提交失败：' + (err.message || ''))
  }
}

// 取消预览
function handleCancelPreview() {
  fileStore.setPreviewMode(false)
  fileStore.fullReset()
  showUploadPanel.value = false
  modeStore.switchMode(modeStore.MODES.CUSTOMER_SERVICE)
}

// 取消上传
function handleCancelUpload() {
  fileStore.fullReset()
  showUploadPanel.value = false
  modeStore.switchMode(modeStore.MODES.CUSTOMER_SERVICE)
}

// 文件记录操作（重新上传 / 查看）
function handleFileAction(message) {
  if (message.status === 'uploaded') {
    // 重新上传：删除该消息之后的所有消息，重新打开上传面板
    const idx = chatStore.messages.indexOf(message)
    if (idx >= 0) {
      chatStore.messages.splice(idx + 1)
    }
    showUploadPanel.value = true
    modeStore.switchMode(modeStore.MODES.FILE_CONVERT)
  }
}
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

      <!-- 上传中 / 提取中 → 覆盖层 -->
      <div
        v-if="showUploadPanel || fileStore.isExtracting || fileStore.statusMessage"
        class="content-overlay"
      >
        <div class="overlay-content">
          <!-- 文件转换模式 → 上传面板 -->
          <FileUpload
            v-if="showUploadPanel"
            @upload-complete="handleUploadComplete"
            @cancel="handleCancelUpload"
          />
          <!-- 提取中/等待文件就绪 → 加载指示器 -->
          <FileExtractStatus
            v-else
            :message="fileStore.statusMessage"
          />
        </div>
      </div>

      <!-- 始终展示的内容区（聊天 + 可选的文件预览） -->
      <div class="content-body">
        <!-- 聊天核心组件（始终存在） -->
        <div class="chat-area-wrapper">
          <Chatbot @file-action="handleFileAction" />
        </div>
        <!-- 文件预览编辑组件（有数据时才展示，与聊天区左右分屏） -->
        <div v-if="fileStore.previewMode && fileStore.extractedData" class="preview-area">
          <FilePreview
            :data="fileStore.extractedData"
            @confirm="handleConfirmData"
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

/* 覆盖层（上传中/提取中时覆盖整个内容区） */
.content-overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

/* 覆盖层内容容器，限制宽度并居中 */
.overlay-content {
  width: 100%;
  max-width: 600px;
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 固定式侧边栏（最大化时）层级高于覆盖层 */
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
