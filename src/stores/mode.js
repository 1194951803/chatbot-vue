import { defineStore } from 'pinia'
import { ref } from 'vue'

// 模式常量
const MODES = {
  CUSTOMER_SERVICE: 'customer_service', // 人工客服
  FILE_CONVERT: 'file_convert', // 文件转换
  TALENT_AGENT: 'talent_agent', // 人才发现智能体
  EMPLOYEE_SELF: 'employee_self', // 员工自助
  LEADERSHIP_ANALYSIS: 'leadership_analysis', // 班子研判
}

const DEFAULT_MODE = MODES.CUSTOMER_SERVICE

// 从全局配置获取各模式头像
function getDefaultAvatars() {
  const config = window.CHATBOT_CONFIG?.avatars || {}
  return {
    [MODES.CUSTOMER_SERVICE]: config.customerService || '',
    [MODES.FILE_CONVERT]: config.fileConvert || '',
    [MODES.TALENT_AGENT]: config.talentAgent || '',
    [MODES.EMPLOYEE_SELF]: config.employeeSelf || '',
    [MODES.LEADERSHIP_ANALYSIS]: config.leadershipAnalysis || '',
  }
}

export const useModeStore = defineStore('mode', () => {
  const currentMode = ref(DEFAULT_MODE)
  const avatars = ref(getDefaultAvatars())

  function switchMode(mode) {
    if (Object.values(MODES).includes(mode)) {
      currentMode.value = mode
    }
  }

  function getCurrentAvatar() {
    return avatars.value[currentMode.value] || ''
  }

  function setAvatars(newAvatars) {
    avatars.value = { ...avatars.value, ...newAvatars }
  }

  return {
    currentMode,
    avatars,
    MODES,
    DEFAULT_MODE,
    switchMode,
    getCurrentAvatar,
    setAvatars,
  }
})