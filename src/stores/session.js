import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const STORAGE_KEY = 'chatbot_sessions'

function loadSessions() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []
  } catch {
    return []
  }
}

function saveSessions(sessions) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions))
}

export const useSessionStore = defineStore('session', () => {
  const sessions = ref(loadSessions())
  const currentSessionId = ref(null)

  const currentSession = computed(() =>
    sessions.value.find((s) => s.id === currentSessionId.value),
  )

  function createSession() {
    const session = {
      id: Date.now().toString(),
      title: '新会话',
      createdAt: new Date().toISOString(),
    }
    sessions.value.unshift(session)
    currentSessionId.value = session.id
    saveSessions(sessions.value)
    return session
  }

  function switchSession(id) {
    currentSessionId.value = id
  }

  function deleteSession(id) {
    sessions.value = sessions.value.filter((s) => s.id !== id)
    if (currentSessionId.value === id) {
      currentSessionId.value = sessions.value[0]?.id || null
    }
    saveSessions(sessions.value)
  }

  function updateTitle(id, title) {
    const session = sessions.value.find((s) => s.id === id)
    if (session) {
      session.title = title
      saveSessions(sessions.value)
    }
  }

  function initSession() {
    if (sessions.value.length === 0) {
      createSession()
    } else {
      currentSessionId.value = sessions.value[0].id
    }
  }

  return {
    sessions,
    currentSessionId,
    currentSession,
    createSession,
    switchSession,
    deleteSession,
    updateTitle,
    initSession,
  }
})