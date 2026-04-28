<script setup>
import { ref, computed } from 'vue'
import { useFileStore } from '../stores/file'
import { getStsToken, uploadFileToOss } from '../api/file'
import getConfig from '../config/index'

const emit = defineEmits(['upload-complete', 'cancel'])

const fileStore = useFileStore()
const config = getConfig()

const allowedFileTypes = config.allowedFileTypes
const maxFileSize = config.maxFileSize

const isDragging = ref(false)
const errorMessages = ref([])
const uploadError = ref('')

const currentModeAvatar = computed(() => {
  return ''
})

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
  const files = Array.from(e.dataTransfer.files)
  if (files.length > 0) {
    validateAndUpload(files)
  }
}

function handleFileSelect(e) {
  const files = Array.from(e.target.files)
  if (files.length > 0) {
    validateAndUpload(files)
  }
  // 重置 input 以便重复选择同一文件
  e.target.value = ''
}

function validateAndUpload(files) {
  errorMessages.value = []
  uploadError.value = ''
  const validFiles = []
  const rejected = []

  for (const file of files) {
    const ext = '.' + file.name.split('.').pop().toLowerCase()
    if (!allowedFileTypes.includes(ext)) {
      rejected.push({ fileName: file.name, reason: `不支持的文件类型（${ext}）` })
      continue
    }
    if (file.size > maxFileSize) {
      const maxSizeMB = (maxFileSize / 1024 / 1024).toFixed(0)
      rejected.push({ fileName: file.name, reason: `文件大小超过 ${maxSizeMB}MB` })
      continue
    }
    validFiles.push(file)
  }

  if (validFiles.length === 0) {
    errorMessages.value = rejected.map((r) => `${r.fileName}: ${r.reason}`)
    return
  }

  uploadFiles(validFiles, rejected)
}

async function uploadFiles(validFiles, rejected) {
  fileStore.isUploading = true
  fileStore.uploadProgress = 0
  fileStore.processStatus = 'uploading'
  errorMessages.value = []
  uploadError.value = ''

  const results = []

  try {
    // 1. 获取 STS 临时凭证
    fileStore.currentFile = { name: '正在获取上传凭证...' }
    const stsConfig = await getStsToken()
    if (stsConfig.error) {
      throw new Error(`获取上传凭证失败: ${stsConfig.error}`)
    }

    // 2. 逐个上传到 OSS
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i]
      fileStore.currentFile = file
      fileStore.uploadProgress = Math.round(((i) / validFiles.length) * 100)

      const ossUrl = await uploadFileToOss(stsConfig, file)
      results.push({ fileName: file.name, ossUrl })
      fileStore.uploadProgress = Math.round(((i + 1) / validFiles.length) * 100)
    }
  } catch (err) {
    uploadError.value = err.message || '上传失败'
    fileStore.isUploading = false
    fileStore.processStatus = ''
    return
  }

  fileStore.isUploading = false
  fileStore.processStatus = ''

  // 3. 通知父组件上传完成（同时传递 rejected 列表）
  emit('upload-complete', { uploaded: results, rejected })
}

function handleCancel() {
  fileStore.reset()
  errorMessages.value = []
  uploadError.value = ''
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
      <div v-if="!fileStore.isUploading && errorMessages.length === 0 && !uploadError" class="upload-prompt">
        <div class="upload-icon">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <p class="upload-text">拖拽文件到此处，或点击选择文件（支持批量）</p>
        <p class="upload-hint">支持 {{ allowedFileTypes.join('、') }}，最大 {{ (maxFileSize / 1024 / 1024).toFixed(0) }}MB</p>
        <label class="upload-btn">
          选择文件
          <input
            type="file"
            :accept="allowedFileTypes.join(',')"
            class="file-input"
            multiple
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

      <!-- 上传失败 -->
      <div v-if="uploadError" class="upload-failed">
        <p class="error-text">{{ uploadError }}</p>
      </div>

      <!-- 错误信息列表（文件校验失败） -->
      <div v-if="errorMessages.length > 0 && !fileStore.isUploading" class="error-messages">
        <div v-for="(msg, i) in errorMessages" :key="i" class="error-item">
          {{ msg }}
        </div>
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

.upload-failed {
  padding: 20px;
  text-align: center;
}

.error-text {
  color: #f56c6c;
  font-size: 14px;
}

.error-messages {
  padding: 20px;
  width: 100%;
}

.error-item {
  color: #f56c6c;
  font-size: 13px;
  padding: 4px 0;
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
