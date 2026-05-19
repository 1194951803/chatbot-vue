import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useFileStore = defineStore('file', () => {
  // 上传级别状态（保留）
  const uploadProgress = ref(0)
  const isUploading = ref(false)
  const isProcessing = ref(false)
  const processStatus = ref('')
  const currentFile = ref(null)
  const errorMessage = ref('')
  const downloadUrl = ref('')

  // 文件记录列表（主要数据源）
  // 每条记录：{ fileId, fileName, uploadTime, fileStatus, statusMessage, extractedData, isExtracting, extractError }
  const fileRecords = ref([])

  // 当前预览面板显示的文件 ID（替代原 previewMode boolean）
  const activePreviewFileId = ref('')

  // 汇总视图显示状态（与单文件预览互斥）
  const showSummaryView = ref(false)

  // 年度考核列表面板显示状态（与单文件预览/汇总视图互斥）
  const showAssessmentView = ref(false)
  const assessmentUrl = ref('')

  // 每文件独立管理的 poll 定时器和提取 controller
  const fileStatusPollTimers = new Map()
  const extractControllers = new Map()

  /**
   * 根据 fileId 查找记录
   */
  function getFileRecord(fileId) {
    return fileRecords.value.find((r) => r.fileId === fileId)
  }

  /**
   * 获取当前正在预览的文件记录
   */
  const activeFileRecord = computed(() => {
    if (!activePreviewFileId.value) return null
    return fileRecords.value.find((r) => r.fileId === activePreviewFileId.value)
  })

  /**
   * 添加文件记录
   */
  function addFileRecord(record) {
    fileRecords.value.push({
      fileId: record.fileId,
      fileName: record.fileName,
      uploadTime: record.uploadTime || new Date().toLocaleString('zh-CN'),
      fileStatus: record.fileStatus || 'INIT',
      statusMessage: record.statusMessage || '',
      extractedData: record.extractedData || null,
      isExtracting: false,
      extractError: '',
      ...record, // 允许覆盖
    })
  }

  /**
   * 更新指定 fileId 的记录（合并更新）
   */
  function updateFileRecord(fileId, updates) {
    const record = getFileRecord(fileId)
    if (record) {
      Object.assign(record, updates)
    }
  }

  /**
   * 设置当前预览的文件
   */
  function setActivePreviewFileId(fileId) {
    activePreviewFileId.value = fileId
  }

  /**
   * 关闭预览面板
   */
  function clearActivePreview() {
    // 中断当前文件的提取
    if (extractControllers.has(activePreviewFileId.value)) {
      extractControllers.get(activePreviewFileId.value).abort()
      extractControllers.delete(activePreviewFileId.value)
    }
    activePreviewFileId.value = ''
    showSummaryView.value = false
  }

  /**
   * 打开/关闭汇总视图（与单文件预览互斥）
   */
  function setShowSummaryView(show) {
    showSummaryView.value = show
    if (show) {
      activePreviewFileId.value = ''
    }
  }

  function closeSummaryView() {
    showSummaryView.value = false
  }

  /**
   * 打开/关闭年度考核列表面板（与单文件预览/汇总视图互斥）
   */
  function setShowAssessmentView(url) {
    showAssessmentView.value = true
    assessmentUrl.value = url
    activePreviewFileId.value = ''
    showSummaryView.value = false
  }

  function closeAssessmentView() {
    showAssessmentView.value = false
    assessmentUrl.value = ''
  }

  /**
   * 是否所有文件都已提取完成
   */
  function areAllFilesExtracted() {
    return fileRecords.value.length > 0 && fileRecords.value.every((r) => r.extractedData !== null)
  }

  /**
   * 启动文件状态轮询（per-file）
   */
  function startFileStatusPoll(fileId, checkFn, interval = 2000) {
    stopFileStatusPoll(fileId)
    const timer = setInterval(async () => {
      try {
        const status = await checkFn(fileId)
        const normalizedStatus = typeof status === 'string' ? status.trim() : String(status)
        updateFileRecord(fileId, { fileStatus: normalizedStatus })
      } catch {
        // 静默重试
      }
    }, interval)
    fileStatusPollTimers.set(fileId, timer)
  }

  /**
   * 停止指定文件的轮询
   */
  function stopFileStatusPoll(fileId) {
    if (fileStatusPollTimers.has(fileId)) {
      clearInterval(fileStatusPollTimers.get(fileId))
      fileStatusPollTimers.delete(fileId)
    }
  }

  /**
   * 停止所有文件的轮询
   */
  function stopAllFileStatusPolls() {
    fileStatusPollTimers.forEach((timer) => clearInterval(timer))
    fileStatusPollTimers.clear()
  }

  /**
   * 注册文件提取的 AbortController
   */
  function registerExtractController(fileId, controller) {
    extractControllers.set(fileId, controller)
  }

  /**
   * 中断指定文件的提取
   */
  function abortFileExtraction(fileId) {
    if (extractControllers.has(fileId)) {
      extractControllers.get(fileId).abort()
      extractControllers.delete(fileId)
    }
  }

  /**
   * 重置（保留上传历史）
   */
  function reset() {
    fullReset()
  }

  /**
   * 完全重置（清空所有状态，包括文件记录）
   */
  function fullReset() {
    uploadProgress.value = 0
    isUploading.value = false
    isProcessing.value = false
    processStatus.value = ''
    currentFile.value = null
    errorMessage.value = ''
    downloadUrl.value = ''
    stopAllFileStatusPolls()
    // 中断所有提取
    extractControllers.forEach((c) => c.abort())
    extractControllers.clear()
    // 清空文件记录和预览状态
    fileRecords.value = []
    activePreviewFileId.value = ''
    showSummaryView.value = false
    showAssessmentView.value = false
    assessmentUrl.value = ''
  }

  return {
    uploadProgress,
    isUploading,
    isProcessing,
    processStatus,
    currentFile,
    errorMessage,
    downloadUrl,
    fileRecords,
    activePreviewFileId,
    showSummaryView,
    showAssessmentView,
    assessmentUrl,
    activeFileRecord,
    getFileRecord,
    addFileRecord,
    updateFileRecord,
    setActivePreviewFileId,
    clearActivePreview,
    setShowSummaryView,
    closeSummaryView,
    setShowAssessmentView,
    closeAssessmentView,
    areAllFilesExtracted,
    startFileStatusPoll,
    stopFileStatusPoll,
    stopAllFileStatusPolls,
    registerExtractController,
    abortFileExtraction,
    reset,
    fullReset,
  }
})
