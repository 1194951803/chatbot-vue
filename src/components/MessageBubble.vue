<script setup>
import { computed, ref } from 'vue'
import { renderMarkdown } from '../utils/markdown'
import FileListMessage from './FileListMessage.vue'
import FileUpload from './FileUpload.vue'

const props = defineProps({
  message: {
    type: Object,
    required: true,
  },
  streaming: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['like', 'dislike', 'regenerate', 'file-action', 'card-action'])

const htmlContent = computed(() => {
  if (props.message.role === 'assistant' && props.message.content) {
    return renderMarkdown(props.message.content)
  }
  return ''
})

const thoughtHtml = computed(() => {
  if (props.message.thoughtContent) {
    return renderMarkdown(props.message.thoughtContent)
  }
  return ''
})

const showThoughts = computed(() => {
  return props.message.thoughtContent && props.message.thoughtContent.length > 0
})

const thoughtsCollapsed = ref(true)

function toggleThoughts() {
  thoughtsCollapsed.value = !thoughtsCollapsed.value
}

const feedbackState = ref(null) // 'like' | 'dislike' | null

// 只有流式响应完成的 AI 消息才显示反馈组件
// - 有 type 字段的特殊消息（interactive_card/file_upload）不显示
// - 标记 noFeedback 的系统消息不显示
const showActions = computed(() => {
  return props.message.role === 'assistant' && !props.streaming && !props.message.type && !props.message.noFeedback
})

const copied = ref(false)

function handleCopy() {
  const text = props.message.content
  navigator.clipboard.writeText(text).then(() => {
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  }).catch(() => {
    // fallback for older browsers / non-HTTPS
    const textarea = document.createElement('textarea')
    textarea.value = text
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  })
}

function handleLike() {
  feedbackState.value = feedbackState.value === 'like' ? null : 'like'
  emit('like', props.message)
}

function handleDislike() {
  feedbackState.value = feedbackState.value === 'dislike' ? null : 'dislike'
  emit('dislike', props.message)
}

function handleRegenerate() {
  emit('regenerate', props.message)
}

function handleFileAction(message) {
  emit('file-action', message)
}

function handleCardAction(action, data) {
  emit('card-action', props.message, { action, data })
}

function getStatusType(status) {
  if (status === '已通过') return 'success'
  if (status === '已驳回') return 'danger'
  if (status === '审批中') return 'warning'
  return 'info'
}
</script>

<template>
  <div class="message-bubble" :class="[message.role]">
    <!-- 用户消息 -->
    <template v-if="message.role === 'user'">
      <div class="bubble-content user-content">{{ message.content }}</div>
    </template>

    <!-- 交互式卡片消息（员工自助）— 必须在 assistant 之前判断，因为卡片消息也有 role: 'assistant' -->
    <template v-else-if="message.type === 'interactive_card'">
      <div class="interactive-card-msg">
        <!-- 请假单卡片 -->
        <template v-if="message.cardType === 'leave_form'">
          <div class="card-title">请假申请单</div>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="请假类型">{{ message.cardData.type }}</el-descriptions-item>
            <el-descriptions-item label="开始时间">{{ message.cardData.startDate }}</el-descriptions-item>
            <el-descriptions-item label="结束时间">{{ message.cardData.endDate }}</el-descriptions-item>
            <el-descriptions-item label="请假事由">{{ message.cardData.reason }}</el-descriptions-item>
            <el-descriptions-item label="状态">{{ message.cardData.status }}</el-descriptions-item>
          </el-descriptions>
          <div class="card-actions">
            <el-button type="primary" size="small" @click="handleCardAction('confirm_leave')">确认提交</el-button>
            <el-button size="small" @click="handleCardAction('cancel')">取消</el-button>
          </div>
        </template>

        <!-- 个人信息卡片 -->
        <template v-else-if="message.cardType === 'profile'">
          <div class="card-title">个人信息</div>
          <el-descriptions :column="1" border size="small">
            <el-descriptions-item label="姓名">{{ message.cardData.name }}</el-descriptions-item>
            <el-descriptions-item label="单位">{{ message.cardData.unitName }}</el-descriptions-item>
            <el-descriptions-item label="部门">{{ message.cardData.deptName }}</el-descriptions-item>
            <el-descriptions-item label="岗位">{{ message.cardData.posName }}</el-descriptions-item>
            <el-descriptions-item label="邮箱">{{ message.cardData.email }}</el-descriptions-item>
            <el-descriptions-item label="手机">{{ message.cardData.phone }}</el-descriptions-item>
          </el-descriptions>
        </template>

        <!-- 薪酬卡片 -->
        <template v-else-if="message.cardType === 'salary'">
          <div class="card-title">{{ message.cardData.month }} 薪酬详情</div>
          <el-descriptions :column="2" border size="small" title="应发项目">
            <el-descriptions-item label="基本工资">{{ message.cardData.baseSalary }}</el-descriptions-item>
            <el-descriptions-item label="绩效奖金">{{ message.cardData.performance }}</el-descriptions-item>
            <el-descriptions-item label="津贴">{{ message.cardData.allowance }}</el-descriptions-item>
            <el-descriptions-item label="&nbsp;">&nbsp;</el-descriptions-item>
          </el-descriptions>
          <el-divider style="margin: 8px 0" />
          <el-descriptions :column="2" border size="small" title="扣款项目">
            <el-descriptions-item label="社保">{{ message.cardData.socialSecurity }}</el-descriptions-item>
            <el-descriptions-item label="公积金">{{ message.cardData.housingFund }}</el-descriptions-item>
            <el-descriptions-item label="个税">{{ message.cardData.tax }}</el-descriptions-item>
            <el-descriptions-item label="&nbsp;">&nbsp;</el-descriptions-item>
          </el-descriptions>
          <el-divider style="margin: 8px 0" />
          <div class="salary-summary">
            <span class="summary-label">应发合计：</span>
            <span class="summary-value">{{ message.cardData.grossSalary }}</span>
            <span class="summary-label" style="margin-left: 16px">实发合计：</span>
            <span class="summary-value net">{{ message.cardData.netSalary }}</span>
          </div>
        </template>

        <!-- 申请记录表格 -->
        <template v-else-if="message.cardType === 'records'">
          <div class="card-title">申请记录</div>
          <el-table :data="message.cardData" size="small" style="width: 100%">
            <el-table-column prop="type" label="类型" width="60" />
            <el-table-column prop="title" label="标题" />
            <el-table-column prop="date" label="日期" width="110" />
            <el-table-column prop="status" label="状态" width="80">
              <template #default="{ row }">
                <el-tag :type="getStatusType(row.status)" size="small">{{ row.status }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </template>

        <div class="message-time">{{ message.time }}</div>
      </div>
    </template>

    <!-- 上传引导消息（内嵌上传区域）— 必须在 assistant 之前判断 -->
    <template v-else-if="message.uploadPrompt">
      <div class="upload-prompt-msg">
        <FileUpload
          @upload-complete="$emit('file-action', { type: 'upload-complete', result: $event })"
          @cancel="$emit('file-action', { type: 'cancel-upload' })"
        />
      </div>
    </template>

    <!-- 文件列表消息（批量上传）— 必须在 assistant 之前判断，因为 file_list 消息也有 role: 'assistant' -->
    <template v-else-if="message.type === 'file_list'">
      <FileListMessage
        :key="message._version || 0"
        :message="message"
        @file-click="$emit('file-action', { type: 'file-click', file: $event, message })"
        @confirm-all="$emit('file-action', { type: 'confirm-all', message })"
        @view-summary="$emit('file-action', { type: 'view-summary' })"
      />
    </template>

    <!-- 工具调用评估链接（functype=3 且包含 URL）— 必须在 assistant 之前判断 -->
    <template v-else-if="message.type === 'tool_assessment'">
      <div class="tool-assessment-msg">
        <div class="tool-assessment-content">
          <span class="tool-assessment-text">{{ message.content }}</span>
          <button class="tool-assessment-btn" @click="$emit('card-action', message, { action: 'open_assessment', url: message.url })">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            查看{{ message.toolName || '详情' }}
          </button>
        </div>
        <div class="message-time">{{ message.time }}</div>
      </div>
    </template>

    <!-- AI 回复 -->
    <template v-else-if="message.role === 'assistant'">
      <!-- 思考过程（可折叠） -->
      <template v-if="showThoughts && message.role === 'assistant'">
        <div class="thought-section">
          <button class="thought-toggle" @click="toggleThoughts">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :class="{ rotated: !thoughtsCollapsed }">
              <polyline points="9 18 15 12 9 6" />
            </svg>
            <span>思考过程</span>
          </button>
          <div v-show="!thoughtsCollapsed" class="thought-content">
            <div class="thought-content-inner markdown-body" v-html="thoughtHtml" />
          </div>
        </div>
      </template>

      <div
        class="bubble-content ai-content markdown-body"
        v-html="htmlContent"
      />
      <div class="message-time">{{ message.time }}</div>

      <!-- 反馈工具栏（流式完成后显示） -->
      <div v-if="showActions" class="message-actions">
        <button
          class="action-btn"
          :class="{ active: copied }"
          title="复制"
          @click="handleCopy"
        >
          <svg v-if="!copied" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span class="action-label">{{ copied ? '已复制' : '复制' }}</span>
        </button>

        <button
          class="action-btn"
          :class="{ active: feedbackState === 'like' }"
          title="有帮助"
          @click="handleLike"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
          </svg>
          <span class="action-label">赞</span>
        </button>

        <button
          class="action-btn"
          :class="{ active: feedbackState === 'dislike' }"
          title="无帮助"
          @click="handleDislike"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
          </svg>
          <span class="action-label">踩</span>
        </button>

        <button
          class="action-btn"
          title="重新生成"
          @click="handleRegenerate"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          <span class="action-label">重新生成</span>
        </button>
      </div>
    </template>

    <!-- 系统消息 -->
    <template v-else-if="message.role === 'system'">
      <div class="system-msg">
        <div class="system-msg-line" />
        <span class="system-msg-text">{{ message.content }}</span>
        <div class="system-msg-line" />
      </div>
    </template>

    <!-- 文件上传记录 -->
    <template v-else-if="message.type === 'file_upload'">
      <div class="file-upload-msg">
        <div class="file-icon">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <div class="file-info">
          <div class="file-name">{{ message.fileName }}</div>
          <div class="file-time">{{ message.uploadTime }}</div>
        </div>
        <button
          class="file-download-btn"
          :title="message.status === 'extracted' ? '已提取' : '重新上传'"
          @click="handleFileAction(message)"
        >
          <svg v-if="message.status === 'extracted'" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
            <polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span class="btn-label">{{ message.status === 'extracted' ? '已提取' : '上传' }}</span>
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.message-bubble {
  display: flex;
  flex-direction: column;
  margin-bottom: 16px;
}

.message-bubble.user {
  align-items: flex-end;
}

.message-bubble.assistant {
  align-items: flex-start;
}

.message-bubble.system {
  align-items: center;
  margin-top: 4px;
  margin-bottom: 4px;
}

.bubble-content {
  max-width: 85%;
  padding: 10px 14px;
  border-radius: 12px;
  line-height: 1.6;
  word-break: break-word;
  white-space: pre-wrap;
  font-size: 14px;
}

.user-content {
  background: #409eff;
  color: #fff;
  border-bottom-right-radius: 4px;
}

.ai-content {
  background: #f4f5f7;
  color: #333;
  border-bottom-left-radius: 4px;
}

.ai-content :deep(p) {
  margin: 4px 0;
}

.ai-content :deep(p:first-child) {
  margin-top: 0;
}

.ai-content :deep(p:last-child) {
  margin-bottom: 0;
}

.ai-content :deep(pre) {
  background: #1e1e1e;
  color: #d4d4d4;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 8px 0;
  font-size: 13px;
}

.ai-content :deep(pre code) {
  background: none;
  padding: 0;
  color: inherit;
}

.ai-content :deep(code) {
  background: #e8e8e8;
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 13px;
}

.ai-content :deep(ul),
.ai-content :deep(ol) {
  padding-left: 20px;
  margin: 8px 0;
}

.ai-content :deep(li) {
  margin-bottom: 4px;
}

.ai-content :deep(a) {
  color: #409eff;
}

.ai-content :deep(blockquote) {
  border-left: 3px solid #ddd;
  padding-left: 12px;
  color: #666;
  margin: 8px 0;
}

.ai-content :deep(table) {
  border-collapse: collapse;
  margin: 8px 0;
  width: 100%;
}

.ai-content :deep(th),
.ai-content :deep(td) {
  border: 1px solid #ddd;
  padding: 6px 10px;
  font-size: 13px;
}

.ai-content :deep(th) {
  background: #f8f9fa;
  font-weight: 600;
}

/* 思考过程区域 */
.thought-section {
  background: #f8f6ff;
  border: 1px solid #e8e2f5;
  border-radius: 8px;
  margin-bottom: 8px;
  overflow: hidden;
}

.thought-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 8px 12px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: #7c6cb0;
  transition: background 0.15s;
}

.thought-toggle:hover {
  background: rgba(124, 108, 176, 0.08);
}

.thought-toggle svg {
  transition: transform 0.2s;
}

.thought-toggle svg.rotated {
  transform: rotate(90deg);
}

.thought-content {
  border-top: 1px solid #e8e2f5;
  padding: 10px 12px;
}

.thought-content-inner {
  font-size: 13px;
  color: #666;
  line-height: 1.7;
  white-space: pre-wrap;
}

.thought-content-inner :deep(p) {
  margin: 4px 0;
}

.thought-content-inner :deep(p:first-child) {
  margin-top: 0;
}

.thought-content-inner :deep(p:last-child) {
  margin-bottom: 0;
}

.message-time {
  font-size: 11px;
  color: #bbb;
  margin-top: 4px;
  padding-left: 4px;
}

/* 系统消息（模式切换提示） */
.system-msg {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
  width: 100%;
}

.system-msg-line {
  flex: 1;
  height: 1px;
  background: #e8e8e8;
  min-width: 20px;
}

.system-msg-text {
  font-size: 12px;
  color: #999;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 文件上传记录 */
.file-upload-msg {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: #f0f9eb;
  border: 1px solid #e1f0c9;
  border-radius: 10px;
  max-width: 85%;
  min-width: 220px;
}

/* 上传引导消息（内嵌上传区域） */
.upload-prompt-msg {
  max-width: 600px;
  min-width: 320px;
  min-height: 300px;
  height: 300px;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 10px;
}

.upload-prompt-msg :deep(.file-upload) {
  padding: 12px;
  height: 100%;
}

.upload-prompt-msg :deep(.upload-area) {
  min-height: 0;
}

.file-icon {
  color: #67c23a;
  flex-shrink: 0;
}

.file-info {
  flex: 1;
  min-width: 0;
}

.file-name {
  font-size: 13px;
  color: #333;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-time {
  font-size: 11px;
  color: #bbb;
  margin-top: 2px;
}

.file-download-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background: #67c23a;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: default;
  flex-shrink: 0;
}

.file-download-btn[title="重新上传"] {
  background: #409eff;
  cursor: pointer;
}

.file-download-btn[title="重新上传"]:hover {
  background: #3a8ee6;
}

.btn-label {
  line-height: 1;
}

/* 反馈工具栏 */
.message-actions {
  display: flex;
  gap: 2px;
  margin-top: 6px;
  padding-left: 4px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: none;
  background: transparent;
  color: #999;
  border-radius: 6px;
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s;
}

.action-btn:hover {
  background: #f0f0f0;
  color: #666;
}

.action-btn.active {
  color: #409eff;
}

.action-btn.active:hover {
  background: #e6f7ff;
}

.action-label {
  line-height: 1;
}

/* 交互式卡片消息（员工自助） */
.interactive-card-msg {
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 10px;
  padding: 14px;
  max-width: 90%;
  min-width: 260px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 10px;
  color: #333;
}

.card-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  justify-content: flex-end;
}

/* 薪酬汇总 */
.salary-summary {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  background: #fafafa;
  border-radius: 6px;
  margin-top: 8px;
}

.summary-label {
  font-size: 13px;
  color: #666;
}

.summary-value {
  font-size: 16px;
  font-weight: 700;
  color: #333;
}

.summary-value.net {
  color: #67c23a;
}

/* Element Plus 组件样式覆盖 */
:deep(.el-descriptions__title) {
  font-size: 13px !important;
  font-weight: 600;
  margin-bottom: 6px;
}

:deep(.el-descriptions__label) {
  font-size: 13px;
}

:deep(.el-descriptions__content) {
  font-size: 13px;
}

/* 工具调用评估链接 */
.tool-assessment-msg {
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 10px;
  padding: 14px;
  max-width: 90%;
  min-width: 260px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.tool-assessment-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tool-assessment-text {
  flex: 1;
  font-size: 14px;
  color: #333;
  line-height: 1.5;
}

.tool-assessment-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  background: #409eff;
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}

.tool-assessment-btn:hover {
  background: #3a8ee6;
}
</style>