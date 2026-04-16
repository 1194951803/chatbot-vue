import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useFileStore = defineStore('file', () => {
  const uploadProgress = ref(0)
  const isUploading = ref(false)
  const isProcessing = ref(false)
  const processStatus = ref('') // 'uploading' | 'parsing' | 'completed' | 'failed'
  const currentFile = ref(null)
  const errorMessage = ref('')
  const downloadUrl = ref('')
  let statusPollTimer = null

  // 文件提取相关状态
  const fileId = ref('')
  const extractedData = ref(null)
  const isExtracting = ref(false)
  const extractError = ref('')
  const previewMode = ref(false) // 是否进入左右分栏预览模式
  const fileStatus = ref('') // 文件处理状态: INIT/PARSING/PARSE_SUCCESS/FILE_IS_READY 等
  const statusMessage = ref('') // 用户可见的状态提示文本
  const fileRecords = ref([]) // 已上传文件记录列表
  let extractController = null
  let fileStatusPollTimer = null

  function setUploadProgress(val) {
    uploadProgress.value = val
  }

  function setUploading(val) {
    isUploading.value = val
  }

  function setProcessing(val) {
    isProcessing.value = val
  }

  function setProcessStatus(status) {
    processStatus.value = status
  }

  function setCurrentFile(file) {
    currentFile.value = file
  }

  function setErrorMessage(msg) {
    errorMessage.value = msg
  }

  function setDownloadUrl(url) {
    downloadUrl.value = url
  }

  function startStatusPoll(fileId, checkFn, interval = 2000) {
    stopStatusPoll()
    statusPollTimer = setInterval(async () => {
      try {
        const result = await checkFn(fileId)
        if (result?.status === 'completed') {
          setProcessStatus('completed')
          setProcessing(false)
          stopStatusPoll()
        } else if (result?.status === 'failed') {
          setProcessStatus('failed')
          setProcessing(false)
          setErrorMessage(result.message || '文件处理失败')
          stopStatusPoll()
        } else {
          setProcessStatus('parsing')
        }
      } catch {
        // 静默重试
      }
    }, interval)
  }

  function stopStatusPoll() {
    if (statusPollTimer) {
      clearInterval(statusPollTimer)
      statusPollTimer = null
    }
  }

  function setFileId(id) {
    fileId.value = id
  }

  function setExtractedData(data) {
    extractedData.value = data
  }

  function setExtracting(val) {
    isExtracting.value = val
  }

  function setExtractError(msg) {
    extractError.value = msg
  }

  function stopFileStatusPoll() {
    if (fileStatusPollTimer) {
      clearInterval(fileStatusPollTimer)
      fileStatusPollTimer = null
    }
  }

  function setFileStatus(status) {
    fileStatus.value = status
  }

  function setStatusMessage(msg) {
    statusMessage.value = msg
  }

  function setPreviewMode(val) {
    previewMode.value = val
  }

  function addFileRecord(record) {
    fileRecords.value.push({
      ...record,
      uploadTime: record.uploadTime || new Date().toLocaleString('zh-CN'),
    })
  }

  function removeFileRecord(index) {
    fileRecords.value.splice(index, 1)
  }

  function abortExtraction() {
    if (extractController) {
      extractController.abort()
      extractController = null
    }
  }

  function reset() {
    fullReset()
  }

  function fullReset() {
    uploadProgress.value = 0
    isUploading.value = false
    isProcessing.value = false
    processStatus.value = ''
    currentFile.value = null
    errorMessage.value = ''
    downloadUrl.value = ''
    stopStatusPoll()
    stopFileStatusPoll()
    fileId.value = ''
    extractedData.value = null
    isExtracting.value = false
    extractError.value = ''
    previewMode.value = false
    fileStatus.value = ''
    statusMessage.value = ''
    // 注意：不重置 fileRecords，保留上传历史
    abortExtraction()
  }

  return {
    uploadProgress,
    isUploading,
    isProcessing,
    processStatus,
    currentFile,
    errorMessage,
    downloadUrl,
    fileId,
    extractedData,
    isExtracting,
    extractError,
    previewMode,
    fileStatus,
    statusMessage,
    fileRecords,
    setUploadProgress,
    setUploading,
    setProcessing,
    setProcessStatus,
    setCurrentFile,
    setErrorMessage,
    setDownloadUrl,
    setFileId,
    setExtractedData,
    setExtracting,
    setExtractError,
    setPreviewMode,
    setFileStatus,
    setStatusMessage,
    addFileRecord,
    removeFileRecord,
    abortExtraction,
    startStatusPoll,
    stopStatusPoll,
    stopFileStatusPoll,
    reset,
    fullReset,
  }
})