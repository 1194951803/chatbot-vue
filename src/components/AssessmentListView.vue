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
const viewMode = ref('assessment') // 'assessment' | 'report'

onMounted(async () => {
  console.log('[AssessmentListView] 组件已挂载, URL:', props.url)
  if (!props.url) {
    console.error('[AssessmentListView] URL 为空')
    ElMessage.error('列表 URL 为空')
    loading.value = false
    return
  }
  try {
    console.log('[AssessmentListView] 发起请求:', props.url)
    const res = await request.get(props.url)
    console.log('[AssessmentListView] 请求结果:', res)
    // axios 响应拦截器已返回 response.data，即 API 响应体本身
    // 兼容多种嵌套结构：
    // 报告模式: { success, records: [...] }
    // 考核模式: { success, data: { homeList: [...] } }
    // 考核模式直出: { homeList: [...] } 或 { list: [...] }
    let listData
    if (Array.isArray(res?.records)) {
      listData = res.records
    } else if (Array.isArray(res?.homeList)) {
      listData = res.homeList
    } else if (Array.isArray(res?.list)) {
      listData = res.list
    } else if (res?.data && Array.isArray(res.data.homeList)) {
      listData = res.data.homeList
    } else if (res?.data && Array.isArray(res.data.list)) {
      listData = res.data.list
    } else if (res?.data && Array.isArray(res.data.records)) {
      listData = res.data.records
    } else if (Array.isArray(res)) {
      listData = res
    } else {
      listData = []
    }
    list.value = listData
    // 检测数据类型：包含 projectId 且无 projectState/status 字段判定为报告模式
    const hasProjectId = listData.some((item) => item?.projectId)
    const hasStateField = listData.some((item) => item?.projectState !== undefined || item?.status !== undefined)
    viewMode.value = hasProjectId && !hasStateField ? 'report' : 'assessment'
    console.log('[AssessmentListView] 视图模式:', viewMode.value, '数据量:', list.value.length)
  } catch (err) {
    console.error('[AssessmentListView] 加载失败:', err)
    ElMessage.error('加载列表失败')
  } finally {
    loading.value = false
  }
})

// ========== 考核模式辅助函数 ==========

/**
 * objState: 0=未填报, 1=已进入考核表未提交, 2=已提交, 3=已完成
 */
function getStatusInfo(item) {
  const state = item?.objState ?? -1
  switch (state) {
    case 0: return { label: '未填报', type: 'danger', dotClass: 'dot-danger' }
    case 1: return { label: '未提交', type: 'warning', dotClass: 'dot-warning' }
    case 2: return { label: '已提交', type: 'success', dotClass: 'dot-success' }
    case 3: return { label: '已完成', type: 'info', dotClass: 'dot-done' }
    default: return { label: '未知', type: 'info', dotClass: 'dot-info' }
  }
}

function getActionText(item) {
  const state = item?.objState ?? -1
  if (state === 0) return '开始填报'
  if (state === 1) return '继续填报'
  if (state === 2) return '查看详情'
  if (state === 3) return '查看结果'
  return '查看'
}

function handleAssessmentAction(item, action) {
  console.log('[AssessmentListView] 考核操作:', action, item)
  ElMessage.info(`${action}：${item?.projectName || item?.title || '考核项目'}`)
}

function getProjectYear(item) {
  return item?.projectYear ? `${item.projectYear}年度` : ''
}

// ========== 报告模式辅助函数 ==========

function getReportTitle(item) {
  return item?.name || item?.title || item?.projectName || item?.reportName || '-'
}

function getReportStartTime(item) {
  const ts = item?.reportDate
  if (!ts) return '-'
  const d = new Date(ts)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getReportType(item) {
  return item?.type || item?.assessmentType || '-'
}

function getReportDescription(item) {
  const text = item?.instructions || item?.projectDesc || item?.remark || ''
  return text.length > 80 ? text.slice(0, 80) + '...' : text
}

function handleReportPreview(item) {
  if (!item?.projectId) {
    ElMessage.warning('暂无报告文件')
    return
  }
  ElMessage.info('报告预览功能开发中')
}

function handleReportDownload(item) {
  if (!item?.projectId) {
    ElMessage.warning('暂无报告文件')
    return
  }
  ElMessage.info('报告下载功能开发中')
}
</script>

<template>
  <div class="assessment-list">
    <div class="list-header">
      <span class="list-title">{{ viewMode === 'report' ? '我的报告' : '我的考核' }}</span>
      <button class="close-btn" @click="emit('close')">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>

    <div class="list-body">
      <!-- 加载态 -->
      <div v-if="loading" class="loading-wrap">
        <div v-if="viewMode === 'report'" class="report-skeleton-grid">
          <div class="report-skeleton-card" v-for="i in 8" :key="i">
            <div class="skeleton-header" />
            <div class="skeleton-field" v-for="j in 3" :key="j" />
          </div>
        </div>
        <template v-else>
          <div class="skeleton-item" v-for="i in 5" :key="i">
            <div class="skeleton-dot" />
            <div class="skeleton-tag" />
            <div class="skeleton-text" />
            <div class="skeleton-action" />
          </div>
        </template>
      </div>

      <!-- 空状态 -->
      <div v-else-if="list.length === 0" class="empty-state">
        暂无数据
      </div>

      <!-- 报告模式：卡片网格 -->
      <div v-else-if="viewMode === 'report'" class="report-grid">
        <div v-for="(item, idx) in list" :key="idx" class="report-card">
          <div class="report-card-header">
            {{ getReportTitle(item) }}
          </div>
          <div class="report-card-body">
            <div class="report-field">
              <span class="field-label">开始时间</span>
              <span class="field-value">{{ getReportStartTime(item) }}</span>
            </div>
            <div class="report-field">
              <span class="field-label">评估类型</span>
              <span class="field-value">{{ getReportType(item) }}</span>
            </div>
            <div class="report-field report-field-desc">
              <span class="field-label">项目描述</span>
              <span class="field-value desc-text">{{ getReportDescription(item) }}</span>
            </div>
          </div>
          <div class="report-card-footer">
            <span class="footer-label">评估报告</span>
            <div class="footer-actions">
              <button class="footer-btn" title="预览" @click="handleReportPreview(item)">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
              <button class="footer-btn" title="下载" @click="handleReportDownload(item)">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 考核模式：列表 -->
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
          <span class="item-name">
            {{ item.projectName || item.title || item.name || '-' }}
            <span v-if="item.projectYear" class="item-year">{{ item.projectYear }}年度</span>
          </span>
          <div class="item-actions">
            <a class="action-link" @click.prevent="handleAssessmentAction(item, getActionText(item))">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
              {{ getActionText(item) }}
            </a>
            <a
              v-if="item.objState === 1"
              class="action-link action-danger"
              @click.prevent="handleAssessmentAction(item, '重新填报')"
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

/* ========== 加载骨架屏 ========== */
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

/* 报告模式骨架屏 */
.report-skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.report-skeleton-card {
  border-radius: 8px;
  overflow: hidden;
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

.skeleton-header {
  height: 36px;
  background: #ddd;
}

.skeleton-field {
  height: 28px;
  margin: 8px 12px;
  background: #e8e8e8;
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

/* ========== 报告模式：卡片网格 ========== */
.report-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.report-card {
  background: #f9f9f9;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #eee;
}

.report-card-header {
  background: #b0b0b0;
  color: #fff;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 600;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-card-body {
  padding: 12px;
}

.report-field {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 6px 0;
  gap: 8px;
}

.report-field-desc {
  align-items: flex-start;
}

.field-label {
  font-size: 12px;
  color: #666;
  flex-shrink: 0;
  white-space: nowrap;
}

.field-value {
  font-size: 12px;
  color: #333;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
}

.desc-text {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-align: left;
  line-height: 1.5;
}

.report-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f0f0f0;
  border-top: 1px solid #e8e8e8;
}

.footer-label {
  font-size: 12px;
  color: #666;
}

.footer-actions {
  display: flex;
  gap: 8px;
}

.footer-btn {
  background: none;
  border: none;
  cursor: pointer;
  color: #666;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.15s;
}

.footer-btn:hover {
  background: #e0e0e0;
  color: #333;
}

/* ========== 考核模式：列表 ========== */
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

.status-dot.dot-danger { background: #f56c6c; }
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

.item-year {
  display: inline-block;
  font-size: 11px;
  color: #999;
  margin-left: 6px;
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
