/**
 * 本地存储封装
 */

export const storage = {
  get(key, defaultValue = null) {
    try {
      const value = localStorage.getItem(key)
      return value ? JSON.parse(value) : defaultValue
    } catch {
      return defaultValue
    }
  },

  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      console.warn('[Storage] Failed to save:', key)
    }
  },

  remove(key) {
    localStorage.removeItem(key)
  },

  clear() {
    localStorage.clear()
  },
}

export default storage