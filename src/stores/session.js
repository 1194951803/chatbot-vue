import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { listSessions, createSessionApi, deleteSessionApi, getSessionMessages } from '../api/session'

export const useSessionStore = defineStore('session', () => {
  const sessions = ref([])
  const currentSessionId = ref(null)
  const isLoading = ref(false)
  const total = ref(0)
  const hasMore = ref(false)
  const currentPage = ref(1)
  const pageSize = 20

  const currentSession = computed(() =>
    sessions.value.find((s) => s.id === currentSessionId.value),
  )

  /**
   * 从后端响应中提取 data 字段，兼容 { code, data } 包装和直接返回
   */
  function extractData(res) {
    if (!res) return null
    // 后端使用 { code: 200, data: { ... } } 格式
    if (res.data !== undefined && res.code !== undefined) {
      return res.data
    }
    // 后端直接返回数据对象
    return res
  }

  /**
   * 加载会话列表（分页）
   */
  async function loadSessionList(reset = false) {
    if (reset) {
      currentPage.value = 1
      sessions.value = []
    }
    isLoading.value = true
    try {
      const res = await listSessions(currentPage.value, pageSize)
      const data = extractData(res)
      if (data) {
        const list = Array.isArray(data) ? data : (data.sessions || [])
        console.log('[Session] Loaded sessions:', list.length, 'items')
        // 映射后端字段：uuid -> id, createTs -> createdAt
        const mapped = list.map((s) => ({
          id: s.id || s.uuid || s.sessionId || '',
          title: s.title || '新会话',
          createdAt: s.createTs,
          updatedAt: s.modifyTs || s.createTs,
        }))
        if (reset) {
          sessions.value = mapped
        } else {
          sessions.value = [...sessions.value, ...mapped]
        }
        total.value = data.total ?? list.length
        hasMore.value = data.hasMore ?? false
        currentPage.value++
      }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 新建会话
   */
  async function createSession(title) {
    const res = await createSessionApi(title)
    const data = extractData(res)
    if (data && (data.id || data.uuid)) {
      const session = {
        id: data.id || data.uuid || data.sessionId || '',
        title: data.title || title || '新会话',
        createdAt: data.createTs,
        updatedAt: data.createTs,
      }
      console.log('[Session] Created session:', session)
      sessions.value.unshift(session)
      currentSessionId.value = session.id
      return session
    }
    console.warn('[Session] Create session failed or missing id, res:', res)
    return null
  }

  /**
   * 切换会话
   */
  function switchSession(id) {
    currentSessionId.value = id
  }

  /**
   * 删除会话
   */
  async function deleteSession(id) {
    await deleteSessionApi(id)
    sessions.value = sessions.value.filter((s) => s.id !== id)
    if (currentSessionId.value === id) {
      currentSessionId.value = sessions.value[0]?.id || null
    }
  }

  /**
   * 加载会话历史消息
   */
  async function loadHistory(sessionId) {
    if (!sessionId) {
      console.error('[Session] loadHistory called with undefined sessionId')
      return []
    }
    console.log('[Session] Loading history for sessionId:', sessionId)
    const res = await getSessionMessages(sessionId)
    return extractData(res) || []
  }

  /**
   * 更新会话标题（本地更新，标题由后端首次创建时确定）
   */
  function updateTitle(id, title) {
    const session = sessions.value.find((s) => s.id === id)
    if (session) {
      session.title = title
    }
  }

  /**
   * 初始化：加载会话列表并选中第一个
   */
  async function init() {
    await loadSessionList(true)
    if (sessions.value.length > 0) {
      currentSessionId.value = sessions.value[0].id
    }
  }

  return {
    sessions,
    currentSessionId,
    currentSession,
    isLoading,
    total,
    hasMore,
    loadSessionList,
    createSession,
    switchSession,
    deleteSession,
    loadHistory,
    updateTitle,
    init,
  }
})