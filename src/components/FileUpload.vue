<script setup>
import { ref, computed } from 'vue'
import { useFileStore } from '../stores/file'
import { useModeStore } from '../stores/mode'
import getConfig from '../config/index'
import { uploadFile, getFileStatus } from '../api/file'

const emit = defineEmits(['upload-complete', 'cancel'])

const fileStore = useFileStore()
const modeStore = useModeStore()
const config = getConfig()

const allowedFileTypes = config.allowedFileTypes
const maxFileSize = config.maxFileSize

const isDragging = ref(false)
const errorMessage = ref('')

const currentModeAvatar = computed(() => modeStore.getCurrentAvatar())

function handleDragOver(e) {
  e.preventDefault()
  isDragging.value = true
}

function handleDragLeave() {
  isDragging.value = false
}

async function handleDrop(e) {
  e.preventDefault()
  isDragging.value = false
  const files = e.dataTransfer.files
  if (files.length > 0) {
    validateAndUpload(files[0])
  }
}

function handleFileSelect(e) {
  const files = e.target.files
  if (files.length > 0) {
    validateAndUpload(files[0])
  }
}

function validateAndUpload(file) {
  errorMessage.value = ''

  // 文件类型校验
  const ext = '.' + file.name.split('.').pop().toLowerCase()
  if (!allowedFileTypes.includes(ext)) {
    errorMessage.value = `不支持的文件类型，仅支持：${allowedFileTypes.join(', ')}`
    return
  }

  // 文件大小校验
  if (file.size > maxFileSize) {
    const maxSizeMB = (maxFileSize / 1024 / 1024).toFixed(0)
    errorMessage.value = `文件大小不能超过 ${maxSizeMB}MB`
    return
  }

  uploadFileFn(file)
}

async function uploadFileFn(file) {
  fileStore.setUploading(true)
  fileStore.setUploadProgress(0)
  fileStore.setProcessStatus('uploading')
  fileStore.setCurrentFile(file)
  errorMessage.value = ''

  try {
    const result = await uploadFile(file)

    // 模拟进度到 100%
    fileStore.setUploadProgress(100)

    // 获取 fileId（后端可能直接返回字符串，或返回包含 fileId 的对象）
    console.log('[FileUpload] Upload response type:', typeof result, ', value:', result)
    const fileId = typeof result === 'string'
      ? result
      : result?.fileId || result?.data?.fileId
    if (!fileId) {
      throw new Error('上传成功但未获取到文件ID')
    }

    // 通知父组件上传完成，开始提取
    emit('upload-complete', fileId, file.name)
  } catch (err) {
    errorMessage.value = err.message || '上传失败，请重试'
    fileStore.setUploading(false)
    fileStore.setProcessStatus('')
  }
}

function handleCancel() {
  fileStore.reset()
  errorMessage.value = ''
  emit('cancel')
}
</script>

<template>
  <div class="file-upload">
    <div
      class="upload-area"
      :class="{ dragging: isDragging, disabled: fileStore.isUploading }"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
    >
      <!-- 上传前状态 -->
      <div v-if="!fileStore.isUploading && !errorMessage" class="upload-prompt">
        <div class="upload-icon">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <p class="upload-text">拖拽文件到此处，或点击选择文件</p>
        <p class="upload-hint">支持 {{ allowedFileTypes.join('、') }}，最大 {{ (maxFileSize / 1024 / 1024).toFixed(0) }}MB</p>
        <label class="upload-btn">
          选择文件
          <input
            type="file"
            :accept="allowedFileTypes.join(',')"
            class="file-input"
            @change="handleFileSelect"
          />
        </label>
      </div>

      <!-- 上传中 -->
      <div v-if="fileStore.isUploading" class="upload-progress">
        <div class="file-info">
          <span class="file-name">{{ fileStore.currentFile?.name || '上传中...' }}</span>
          <span class="file-percent">{{ fileStore.uploadProgress }}%</span>
        </div>
        <div class="progress-bar">
          <div
            class="progress-fill"
            :style="{ width: fileStore.uploadProgress + '%' }"
          />
        </div>
      </div>

      <!-- 错误信息 -->
      <div v-if="errorMessage" class="error-message">
        {{ errorMessage }}
      </div>
    </div>

    <!-- 取消按钮 -->
    <div class="upload-actions">
      <button class="cancel-btn" @click="handleCancel">
        取消
      </button>
    </div>
  </div>
</template>

<style scoped>
.file-upload {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: 20px;
}

.upload-area {
  flex: 1;
  width: 100%;
  min-width: 0;
  border: 2px dashed #d0d0d0;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  background: #fafafa;
  box-sizing: border-box;
}

.upload-area.dragging {
  border-color: #409eff;
  background: #ecf5ff;
}

.upload-area.disabled {
  opacity: 0.6;
  pointer-events: none;
}

.upload-prompt {
  text-align: center;
  padding: 20px;
  max-width: 500px;
  width: 100%;
  box-sizing: border-box;
}

.upload-icon {
  color: #c0c0c0;
  margin-bottom: 16px;
}

.upload-text {
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
}

.upload-hint {
  font-size: 12px;
  color: #999;
  margin-bottom: 20px;
}

.upload-btn {
  display: inline-block;
  padding: 8px 24px;
  background: #409eff;
  color: #fff;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s;
}

.upload-btn:hover {
  background: #3a8ee6;
}

.file-input {
  display: none;
}

.upload-progress {
  width: 100%;
  padding: 20px;
}

.file-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 10px;
  font-size: 14px;
  color: #666;
}

.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 70%;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #e0e0e0;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #409eff;
  border-radius: 4px;
  transition: width 0.3s;
}

.error-message {
  color: #f56c6c;
  font-size: 14px;
  padding: 20px;
  text-align: center;
}

.upload-actions {
  margin-top: 16px;
  display: flex;
  justify-content: center;
}

.cancel-btn {
  padding: 8px 24px;
  border: 1px solid #ddd;
  background: #fff;
  border-radius: 6px;
  font-size: 14px;
  color: #666;
  cursor: pointer;
  transition: all 0.15s;
}

.cancel-btn:hover {
  border-color: #f56c6c;
  color: #f56c6c;
}
</style>
