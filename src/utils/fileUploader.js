/**
 * 文件上传工具 — 从 FileUpload 组件中提取的共享逻辑
 */

import { getStsToken, uploadFileToOss } from '../api/file'
import { useFileStore } from '../stores/file'
import getConfig from '../config/index'

const config = getConfig()
const allowedFileTypes = config.allowedFileTypes
const maxFileSize = config.maxFileSize

/**
 * 校验并上传文件到 OSS
 * @param {FileList|File[]} files
 * @param {function} onProgress - (percent) => void
 * @returns {Promise<{ uploaded: { fileName, ossUrl }[], rejected: { fileName, reason }[] }>}
 */
export async function uploadFilesToOSS(files, onProgress) {
  const fileStore = useFileStore()
  const errorMessages = []
  const rejected = []

  // 校验
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
  }

  const validFiles = files.filter((f) => {
    const ext = '.' + f.name.split('.').pop().toLowerCase()
    return allowedFileTypes.includes(ext) && f.size <= maxFileSize
  })

  if (validFiles.length === 0) {
    return { uploaded: [], rejected }
  }

  // 上传
  fileStore.isUploading = true
  fileStore.uploadProgress = 0
  fileStore.processStatus = 'uploading'

  const results = []

  try {
    const stsConfig = await getStsToken()
    if (stsConfig.error) {
      throw new Error(`获取上传凭证失败: ${stsConfig.error}`)
    }

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i]
      fileStore.currentFile = file
      fileStore.uploadProgress = Math.round((i / validFiles.length) * 100)
      onProgress?.(fileStore.uploadProgress)

      const ossUrl = await uploadFileToOss(stsConfig, file)
      results.push({ fileName: file.name, ossUrl })
      fileStore.uploadProgress = Math.round(((i + 1) / validFiles.length) * 100)
      onProgress?.(fileStore.uploadProgress)
    }
  } catch (err) {
    fileStore.isUploading = false
    fileStore.processStatus = ''
    throw err
  }

  fileStore.isUploading = false
  fileStore.processStatus = ''

  return { uploaded: results, rejected }
}
