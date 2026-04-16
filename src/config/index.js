/**
 * 全局配置解析模块
 * 从 window.CHATBOT_CONFIG 中读取配置，提供默认值
 */

const DEFAULT_CONFIG = {
  baseUrl: '',  // 使用相对路径，由 Nginx 代理转发
  title: '数智小宏',
  greeting: '你好！我是数智员工小宏，有什么可以帮助你的吗？',
  token: '',
  avatars: {
    customerService: '',
    fileConvert: '',
    talentAgent: '',
    employeeSelf: '',
  },
  allowedFileTypes: [
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.txt', '.csv', '.png', '.jpg', '.jpeg',
  ],
  maxFileSize: 50 * 1024 * 1024, // 50MB
  dataProcessors: [],
  quickActions: [
    { label: '文件转换', mode: 'file_convert' },
    { label: '员工自助', mode: 'employee_self' },
    { label: '人才发展', mode: 'talent_agent' },
  ],
  mockExtract: false, // 是否使用模拟数据（调试用）
}

function getConfig() {
  const userConfig = window.CHATBOT_CONFIG || {}
  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
    avatars: { ...DEFAULT_CONFIG.avatars, ...(userConfig.avatars || {}) },
    allowedFileTypes: userConfig.allowedFileTypes || DEFAULT_CONFIG.allowedFileTypes,
    maxFileSize: userConfig.maxFileSize || DEFAULT_CONFIG.maxFileSize,
    quickActions: userConfig.quickActions || DEFAULT_CONFIG.quickActions,
  }
}

export default getConfig