<script setup>
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import request from '../api/request'

const props = defineProps({
  url: { type: String, required: true },
})

const emit = defineEmits(['close'])

const loading = ref(true)
const list = ref([])

onMounted(async () => {
  console.log('[AssessmentListView] 组件已挂载, URL:', props.url)
  if (!props.url) {
    console.error('[AssessmentListView] URL 为空')
    ElMessage.error('考核列表 URL 为空')
    loading.value = false
    return
  }
  try {
    console.log('[AssessmentListView] 发起请求:', props.url)
    const res = await request.get(props.url)
    console.log('[AssessmentListView] 请求结果:', res)
    // 兼容多种数据结构
    let data = res
    if (res?.data !== undefined) {
      data = res.data
    }
    // homeList / list / 直接数组
    let listData = data
    if (Array.isArray(data?.homeList)) {
      listData = data.homeList
    } else if (Array.isArray(data?.list)) {
      listData = data.list
    } else if (Array.isArray(data?.records)) {
      listData = data.records
    } else if (!Array.isArray(data)) {
      listData = []
    }
    list.value = listData
    console.log('[AssessmentListView] 解析后列表数据:', list.value)
  } catch (err) {
    console.error('[AssessmentListView] 加载失败:', err)
    ElMessage.error('加载考核列表失败')
  } finally {
    loading.value = false
  }
})

// 状态映射（projectState: 0=未进入考核表, 1=已进入未提交, 2=已提交, 3=已完成）
function getStatusInfo(item) {
  const state = item?.projectState ?? item?.status ?? -1
  switch (state) {
    case 0: return { label: '未进入考核表', type: 'info', dotClass: 'dot-info' }
    case 1: return { label: '未提交', type: 'warning', dotClass: 'dot-warning' }
    case 2: return { label: '已提交', type: 'success', dotClass: 'dot-success' }
    case 3: return { label: '已完成', type: 'info', dotClass: 'dot-done' }
    default: return { label: '未知', type: 'info', dotClass: 'dot-info' }
  }
}

// 操作按钮文本
function getActionText(item) {
  const state = item?.projectState ?? item?.status ?? -1
  if (state === 0) return '进入考核表'
  if (state === 1) return '继续填报'
  if (state === 2) return '查看详情'
  if (state === 3) return '查看结果'
  return '查看'
}

// 操作按钮点击
function handleAction(item, action) {
  console.log('[AssessmentListView] 操作:', action, item)
  // TODO: 对接具体填报/重新填报逻辑
  ElMessage.info(`${action}：${item?.khmc || item?.title || '考核项目'}`)
}
</script>

<template>
  <div class="assessment-list">
    <div class="list-header">
      <span class="list-title">我的考核</span>
      <button class="close-btn" @click="emit('close')">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div class="list-body">
      <!-- 加载态 -->
      <div v-if="loading" class="loading-wrap">
        <div class="skeleton-item" v-for="i in 5" :key="i">
          <div class="skeleton-dot" />
          <div class="skeleton-tag" />
          <div class="skeleton-text" />
          <div class="skeleton-action" />
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else-if="list.length === 0" class="empty-state">
        暂无考核数据
      </div>

      <!-- 列表 -->
      <div v-else class="item-list">
        <div v-for="(item, idx) in list" :key="idx" class="list-item">
          <div class="item-status">
            <span
              class="status-dot"
              :class="getStatusInfo(item).dotClass"
            />
            <el-tag
              :type="getStatusInfo(item).type"
              size="small"
              effect="light"
              round
            >
              {{ getStatusInfo(item).label }}
            </el-tag>
          </div>
          <span class="item-name">{{ item.projectName || item.title || item.name || '-' }}</span>
          <div class="item-actions">
            <a class="action-link" @click.prevent="handleAction(item, getActionText(item))">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              {{ getActionText(item) }}
            </a>
            <a
              v-if="(item.projectState ?? item?.status) === 1"
              class="action-link action-danger"
              @click.prevent="handleAction(item, '重新填报')"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
              </svg>
              重新填报
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.assessment-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid #eee;
}

.list-title {
  font-size: 18px;
  font-weight: 600;
  color: #333;
  border-left: 3px solid #409eff;
  padding-left: 10px;
}

.close-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #999;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.15s;
}

.close-btn:hover {
  background: #f5f5f5;
  color: #333;
}

.list-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 20px;
}

/* 加载骨架屏 */
.loading-wrap {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.skeleton-item {
  display: flex;
  align-items: center;
  gap: 10px;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-dot,
.skeleton-tag,
.skeleton-text,
.skeleton-action {
  border-radius: 4px;
  background: #e8e8e8;
}

.skeleton-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.skeleton-tag {
  width: 50px;
  height: 22px;
  flex-shrink: 0;
}

.skeleton-text {
  flex: 1;
  height: 16px;
}

.skeleton-action {
  width: 70px;
  height: 16px;
  flex-shrink: 0;
}

@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* 空状态 */
.empty-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: #999;
  font-size: 14px;
}

/* 列表项 */
.item-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.list-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid #f5f5f5;
}

.list-item:last-child {
  border-bottom: none;
}

.item-status {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.dot-info { background: #909399; }
.status-dot.dot-warning { background: #e6a23c; }
.status-dot.dot-success { background: #67c23a; }
.status-dot.dot-done { background: #409eff; }

.item-name {
  flex: 1;
  font-size: 14px;
  color: #333;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-actions {
  display: flex;
  gap: 12px;
  flex-shrink: 0;
}

.action-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 13px;
  color: #409eff;
  cursor: pointer;
  text-decoration: none;
  white-space: nowrap;
  transition: color 0.15s;
}

.action-link:hover {
  color: #66b1ff;
}

.action-danger {
  color: #f56c6c;
}

.action-danger:hover {
  color: #e04c4c;
}
</style>
