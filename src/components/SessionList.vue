<script setup>
import { computed } from 'vue'
import { useSessionStore } from '../stores/session'

defineProps({
  activeId: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['select', 'new', 'delete'])

const sessionStore = useSessionStore()
const sessions = computed(() => sessionStore.sessions)

function handleNew() {
  emit('new')
}

function handleSelect(id) {
  emit('select', id)
}

function handleDelete(id, e) {
  e.stopPropagation()
  emit('delete', id)
}

function formatTime(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date
  if (diff < 60 * 1000) return '刚刚'
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / (60 * 60 * 1000))}小时前`
  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}
</script>

<template>
  <div class="session-list">
    <div class="session-header">
      <span class="session-title">会话历史</span>
      <button class="new-session-btn" @click="handleNew">+ 新建</button>
    </div>
    <div class="session-items">
      <div
        v-for="session in sessions"
        :key="session.id"
        class="session-item"
        :class="{ active: session.id === activeId }"
        @click="handleSelect(session.id)"
      >
        <div class="session-info">
          <span class="session-name">{{ session.title }}</span>
          <span class="session-time">{{ formatTime(session.createdAt) }}</span>
        </div>
        <button class="delete-btn" @click="handleDelete(session.id, $event)">
          &times;
        </button>
      </div>
      <div v-if="sessions.length === 0" class="session-empty">
        暂无会话
      </div>
    </div>
  </div>
</template>

<style scoped>
.session-list {
  min-width: 220px;
  width: 260px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: #f8f9fa;
  border-right: 1px solid #eee;
  flex-shrink: 0;
}

/* 最大化模式下侧边栏自适应宽度 */
@media (min-width: 800px) {
  .session-list {
    width: 280px;
  }
}

.session-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid #eee;
}

.session-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.new-session-btn {
  background: #409eff;
  color: #fff;
  border: none;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
}

.new-session-btn:hover {
  background: #3a8ee6;
}

.session-items {
  flex: 1;
  overflow-y: auto;
}

.session-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.15s;
}

.session-item:hover {
  background: #eef0f4;
}

.session-item.active {
  background: #e6f7ff;
  border-left: 3px solid #409eff;
}

.session-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.session-name {
  font-size: 13px;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-time {
  font-size: 11px;
  color: #999;
}

.delete-btn {
  background: none;
  border: none;
  color: #999;
  font-size: 18px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  opacity: 0;
  transition: all 0.15s;
}

.session-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  color: #f56c6c;
}

.session-empty {
  text-align: center;
  color: #999;
  font-size: 13px;
  padding: 40px 0;
}
</style>
