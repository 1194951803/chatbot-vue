/**
 * 标准化提取数据结构
 * 将中文 key 映射为英文 key，供 FilePreview 组件使用
 */

const KEY_MAP = {
  '唯一标识': 'identity',
  '基本信息': 'basicInfo',
  '教育背景': 'education',
  '工作经历': 'workExperience',
  '项目': 'projects',
  '项目名称': '项目名称',
  '项目职责': '项目职责',
  '项目业绩': '项目业绩',
  '技能证书': 'certificates',
  '技能': 'skills',
  '自我介绍': 'selfIntroduction',
  '证书名称': '证书名称',
}

/**
 * 将中文 key 的数据结构标准化为英文 key
 */
export function normalizeExtractData(data) {
  if (!data || typeof data !== 'object') return data

  const result = {}
  for (const [key, value] of Object.entries(data)) {
    const englishKey = KEY_MAP[key] || key
    if (Array.isArray(value)) {
      result[englishKey] = value.map(item => {
        if (typeof item === 'object' && item !== null) {
          return normalizeExtractData(item)
        }
        return item
      })
    } else if (typeof value === 'object' && value !== null) {
      result[englishKey] = normalizeExtractData(value)
    } else {
      result[englishKey] = value
    }
  }
  return result
}

export default normalizeExtractData
