<script setup>
import { useFileStore } from '../stores/file'

const props = defineProps({
  message: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['file-click', 're-upload', 'confirm-all'])

const fileStore = useFileStore()

const uploadedCount = props.message.files?.filter((f) => f.status === 'extracted').length || 0
const totalCount = props.message.files?.length || 0
const allExtracted = totalCount > 0 && uploadedCount === totalCount

function getStatusText(file) {
  if (file.extractError) return file.extractError
  if (file.status === 'extracted') return '已提取'
  if (file.status === 'submitted') return '已提交'
  if (file.status === 'uploading' || file.isExtracting) return '解析中...'
  if (file.fileStatus === 'parsing') return '解析中...'
  if (file.fileStatus === 'success') return '解析完成'
  if (file.fileStatus === 'failed') return '解析失败'
  if (file.status === 'failed') return '解析失败'
  return file.statusMessage || '处理中...'
}

function getStatusClass(file) {
  if (file.extractError || file.status === 'failed' || file.fileStatus === 'failed') return 'error'
  if (file.status === 'extracted' || file.status === 'submitted' || file.fileStatus === 'success') return 'success'
  if (file.isExtracting || file.fileStatus === 'parsing') return 'loading'
  return 'default'
}

function getActionText(file) {
  if (file.fileId === fileStore.activePreviewFileId) return '正在预览'
  if (file.status === 'extracted') return '查看'
  if (file.status === 'submitted') return '已提交'
  if (file.extractError || file.status === 'failed') return '重试'
  return '等待中'
}

function isClickable(file) {
  return file.status === 'extracted' || file.extractError || file.status === 'failed'
}
</script>

<template>
  <div class="file-list-msg">
    <div class="file-list-header">
      <span class="file-count">
        <svg class="file-list-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
        已上传 {{ totalCount }} 个文件，已提取 {{ uploadedCount }} 个
      </span>
      <span v-if="message.rejected?.length > 0" class="rejected-count">
        {{ message.rejected.length }} 个被拒绝
      </span>
    </div>

    <!-- 被拒绝的文件 -->
    <div v-if="message.rejected?.length > 0" class="rejected-section">
      <div v-for="(r, i) in message.rejected" :key="'rejected-' + i" class="rejected-item">
        <span class="rejected-name">{{ r.fileName }}</span>
        <span class="rejected-reason">{{ r.reason }}</span>
      </div>
    </div>

    <!-- 文件列表 -->
    <div class="file-items">
      <div
        v-for="(file, idx) in message.files"
        :key="file.fileId || idx"
        class="file-item"
        :class="{
          'is-active': file.fileId === fileStore.activePreviewFileId,
          'is-error': file.extractError,
          'is-clickable': isClickable(file),
        }"
        @click="isClickable(file) && $emit('file-click', file)"
      >
        <div class="file-item-icon">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <div class="file-item-info">
          <div class="file-item-name">{{ file.fileName }}</div>
          <div class="file-item-status" :class="getStatusClass(file)">
            <span v-if="file.isExtracting" class="loading-spinner"></span>
            {{ getStatusText(file) }}
          </div>
        </div>
        <div class="file-item-action">
          {{ getActionText(file) }}
        </div>
      </div>
    </div>

    <!-- 全部提取完成后显示确认按钮 -->
    <div v-if="allExtracted" class="file-list-actions">
      <button class="confirm-all-btn" @click="$emit('confirm-all')">
        确认提交全部 ({{ totalCount }})
      </button>
    </div>
  </div>
</template>

<style scoped>
.file-list-msg {
  background: #f8f9fa;
  border: 1px solid #e8e8e8;
  border-radius: 8px;
  padding: 12px;
  max-width: 420px;
}

.file-list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 0 8px;
  border-bottom: 1px solid #e8e8e8;
  margin-bottom: 8px;
}

.file-count {
  font-size: 13px;
  color: #333;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 4px;
}

.file-list-icon {
  color: #409eff;
}

.rejected-count {
  font-size: 12px;
  color: #f56c6c;
}

.rejected-section {
  margin-bottom: 8px;
  padding: 4px 0;
}

.rejected-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 8px;
  font-size: 12px;
  color: #f56c6c;
  background: #fef0f0;
  border-radius: 4px;
  margin-bottom: 4px;
}

.rejected-name {
  font-weight: 500;
}

.file-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  background: #fff;
  border: 1px solid #e8e8e8;
  transition: all 0.15s;
}

.file-item.is-clickable {
  cursor: pointer;
}

.file-item.is-clickable:hover {
  border-color: #409eff;
  background: #f0f7ff;
}

.file-item.is-active {
  border-color: #409eff;
  background: #ecf5ff;
  box-shadow: 0 0 0 1px #409eff;
}

.file-item.is-error {
  border-color: #f56c6c;
}

.file-item-icon {
  color: #909399;
  flex-shrink: 0;
}

.file-item.is-active .file-item-icon {
  color: #409eff;
}

.file-item.is-error .file-item-icon {
  color: #f56c6c;
}

.file-item-info {
  flex: 1;
  min-width: 0;
}

.file-item-name {
  font-size: 13px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.file-item-status {
  font-size: 12px;
  color: #999;
  margin-top: 2px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.file-item-status.success {
  color: #67c23a;
}

.file-item-status.error {
  color: #f56c6c;
}

.file-item-status.loading {
  color: #409eff;
}

.loading-spinner {
  width: 10px;
  height: 10px;
  border: 2px solid #e0e0e0;
  border-top-color: #409eff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.file-item-action {
  font-size: 12px;
  color: #999;
  flex-shrink: 0;
  white-space: nowrap;
}

.file-item.is-active .file-item-action {
  color: #409eff;
}

.file-item.is-clickable:hover .file-item-action {
  color: #409eff;
}

.file-list-actions {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #e8e8e8;
  display: flex;
  justify-content: center;
}

.confirm-all-btn {
  padding: 6px 20px;
  background: #409eff;
  color: #fff;
  border: none;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

.confirm-all-btn:hover {
  background: #3a8ee6;
}
</style>
