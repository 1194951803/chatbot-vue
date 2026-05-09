<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { batchDownloadExcel } from '../api/file'

const props = defineProps({
  data: {
    type: Object,
    required: true,
  },
  fileName: {
    type: String,
    default: '',
  },
})

const emit = defineEmits(['confirm', 'cancel'])

const generating = ref(false)

const DOC_TYPE_KEY = '文档类型'

// 深拷贝供编辑（不直接修改 props.data）
const editData = ref({})

function cloneData(value) {
  if (value == null) return {}
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return { ...value }
  }
}

// 初始化 + 跟随 props.data 变化（不同文件切换时重新克隆）
watch(
  () => props.data,
  (val) => {
    editData.value = cloneData(val)
  },
  { immediate: true, deep: false },
)

function handleConfirm() {
  emit('confirm', editData.value)
}

function handleCancel() {
  emit('cancel')
}

async function handleGenerateExcel() {
  if (generating.value) return
  generating.value = true
  try {
    // 后端 /ai/api/file/batch/excel 接收 jsonDataList（数组），单文件包成长度为 1
    const blob = await batchDownloadExcel([editData.value])
    triggerBlobDownload(blob, buildExcelFileName())
    ElMessage.success('Excel 已生成并开始下载')
  } catch (err) {
    console.error('[GenerateExcel Error]', err)
    ElMessage.error('生成 Excel 失败：' + (err?.message || '未知错误'))
  } finally {
    generating.value = false
  }
}

function buildExcelFileName() {
  const base = props.fileName || editData.value?.[DOC_TYPE_KEY] || '导出数据'
  // 去掉原始扩展名，加上 .xlsx
  const stem = String(base).replace(/\.[^.]+$/, '')
  const ts = new Date()
    .toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 14)
  return `${stem}-${ts}.xlsx`
}

function triggerBlobDownload(blob, fileName) {
  // 后端可能返回 Blob 也可能返回 ArrayBuffer / 包了一层的 axios response
  const realBlob = blob instanceof Blob
    ? blob
    : new Blob(
        [blob?.data ?? blob],
        { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      )
  const url = URL.createObjectURL(realBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // 延迟释放，给浏览器一帧时间触发下载
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

// 判断值是否适合用 input 直接展示
function isPrimitive(value) {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((v) => typeof v === 'string' || typeof v === 'number')
}

function isObjectArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every((v) => v && typeof v === 'object' && !Array.isArray(v))
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// 通用渲染：按字段类型分类
function categorizeFields(data) {
  const primitives = []  // 顶层字符串/数字 → 单输入框
  const grids = []       // 顶层对象 → 网格表单
  const tables = []      // 顶层对象数组 → 表格
  const texts = []       // 顶层字符串数组 → 多段 textarea
  const others = []      // 其他无法分类的（如混合数组）→ JSON 兜底展示

  for (const [key, value] of Object.entries(data || {})) {
    if (key === DOC_TYPE_KEY) continue // 已作为标题渲染，跳过避免重复

    if (value == null) {
      continue
    } else if (isStringArray(value)) {
      if (value.length === 0) continue
      texts.push({ label: key, key })
    } else if (isObjectArray(value)) {
      tables.push({ label: key, key })
    } else if (isPlainObject(value)) {
      grids.push({ label: key, key })
    } else if (isPrimitive(value)) {
      primitives.push({ label: key, key })
    } else {
      others.push({ label: key, key })
    }
  }

  return { primitives, grids, tables, texts, others }
}

const categorized = computed(() => categorizeFields(editData.value))

// 收集所有行的字段并集（兼容行间字段不一致）。排除"对象数组"（→ 子表）和"对象"。
function getTableColumns(rows) {
  if (!rows || rows.length === 0) return []
  const keys = new Set()
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    for (const k of Object.keys(row)) keys.add(k)
  }
  return [...keys].filter((k) => {
    const sample = rows.find((r) => r && r[k] !== undefined && r[k] !== null)?.[k]
    if (sample === undefined) return true
    if (isObjectArray(sample)) return false
    if (isPlainObject(sample)) return false
    return true
  })
}

function getNestedTableData(row) {
  if (!row || typeof row !== 'object') return []
  const groups = []
  for (const [key, value] of Object.entries(row)) {
    if (isObjectArray(value)) {
      groups.push({ key, label: key, rows: value })
    }
  }
  return groups
}

function getNestedColumns(rows) {
  if (!rows || rows.length === 0) return []
  const keys = new Set()
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    for (const k of Object.keys(row)) keys.add(k)
  }
  return [...keys]
}

// 为单元格选择渲染方式：input / textarea(单段长文本) / textarea(多行字符串数组)
function cellKind(value) {
  if (isStringArray(value)) return 'string-array'
  if (typeof value === 'string' && value.length > 60) return 'long-text'
  return 'input'
}

function joinForTextarea(arr) {
  return Array.isArray(arr) ? arr.join('\n') : (arr ?? '')
}

function syncFromTextarea(targetRow, col, raw) {
  const original = targetRow[col]
  if (Array.isArray(original)) {
    targetRow[col] = String(raw ?? '').split(/\n+/).map((s) => s.trim()).filter(Boolean)
  } else {
    targetRow[col] = raw
  }
}

function prettyJson(value) {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
</script>

<template>
  <div class="file-preview">
    <div class="preview-header">
      <h3 class="preview-title">文件数据预览</h3>
      <div class="header-actions">
        <button class="action-btn cancel" @click="handleCancel">取消</button>
        <button
          class="action-btn excel"
          :disabled="generating"
          @click="handleGenerateExcel"
        >
          {{ generating ? '生成中...' : '生成 Excel' }}
        </button>
        <button class="action-btn confirm" @click="handleConfirm">确认提交</button>
      </div>
    </div>

    <div class="preview-content">
      <!-- 文档类型标题 -->
      <section v-if="editData[DOC_TYPE_KEY]" class="data-section doc-type">
        <h2 class="doc-type-title">{{ editData[DOC_TYPE_KEY] }}</h2>
      </section>

      <!-- 顶层字符串/数字字段（独立成 section） -->
      <section v-if="categorized.primitives.length > 0" class="data-section">
        <h4 class="section-title">基本字段</h4>
        <div class="info-grid">
          <div v-for="p in categorized.primitives" :key="p.key" class="info-item">
            <label class="info-label">{{ p.label }}</label>
            <input class="info-input" v-model="editData[p.key]" :placeholder="p.label" />
          </div>
        </div>
      </section>

      <!-- 网格表单：对象字段（如 个人信息） -->
      <section v-for="grid in categorized.grids" :key="grid.key" class="data-section">
        <h4 class="section-title">{{ grid.label }}</h4>
        <div class="info-grid">
          <template
            v-for="(value, subKey) in editData[grid.key]"
            :key="subKey"
          >
            <!-- 子字段是字符串/数字 → input -->
            <div v-if="isPrimitive(value)" class="info-item">
              <label class="info-label">{{ subKey }}</label>
              <input class="info-input" v-model="editData[grid.key][subKey]" :placeholder="subKey" />
            </div>
            <!-- 子字段是字符串数组 → textarea（多行展示） -->
            <div v-else-if="isStringArray(value)" class="info-item info-item-wide">
              <label class="info-label">{{ subKey }}</label>
              <textarea
                class="self-intro"
                :value="joinForTextarea(value)"
                rows="3"
                :placeholder="subKey"
                @input="syncFromTextarea(editData[grid.key], subKey, $event.target.value)"
              />
            </div>
            <!-- 嵌套对象/复杂结构 → JSON 兜底 -->
            <div v-else-if="value && typeof value === 'object'" class="info-item info-item-wide">
              <label class="info-label">{{ subKey }}</label>
              <pre class="json-fallback">{{ prettyJson(value) }}</pre>
            </div>
          </template>
        </div>
      </section>

      <!-- 表格：数组对象字段（如 教育背景、工作经历） -->
      <section v-for="table in categorized.tables" :key="table.key" class="data-section">
        <h4 class="section-title">{{ table.label }}</h4>
        <div v-for="(row, rIdx) in editData[table.key]" :key="rIdx" class="table-group">
          <el-table :data="[row]" border size="small" style="width: 100%">
            <el-table-column
              v-for="col in getTableColumns(editData[table.key])"
              :key="col"
              :prop="col"
              :label="col"
              min-width="140"
            >
              <template #default="{ row: r }">
                <template v-if="cellKind(r[col]) === 'string-array'">
                  <textarea
                    class="table-textarea"
                    :value="joinForTextarea(r[col])"
                    :placeholder="col"
                    rows="3"
                    @input="syncFromTextarea(r, col, $event.target.value)"
                  />
                </template>
                <template v-else-if="cellKind(r[col]) === 'long-text'">
                  <textarea
                    class="table-textarea"
                    v-model="r[col]"
                    :placeholder="col"
                    rows="3"
                  />
                </template>
                <input v-else class="table-input" v-model="r[col]" :placeholder="col" />
              </template>
            </el-table-column>
          </el-table>

          <!-- 行内嵌套对象数组（如工作经历下的项目列表）-->
          <template v-for="nested in getNestedTableData(row)" :key="table.key + '-' + rIdx + '-' + nested.key">
            <div class="sub-section">
              <h5 class="sub-title">{{ nested.label }}</h5>
              <el-table :data="nested.rows" border size="small" style="width: 100%">
                <el-table-column
                  v-for="col in getNestedColumns(nested.rows)"
                  :key="col"
                  :prop="col"
                  :label="col"
                  min-width="120"
                >
                  <template #default="{ row: nr }">
                    <template v-if="cellKind(nr[col]) === 'string-array'">
                      <textarea
                        class="table-textarea"
                        :value="joinForTextarea(nr[col])"
                        :placeholder="col"
                        rows="3"
                        @input="syncFromTextarea(nr, col, $event.target.value)"
                      />
                    </template>
                    <template v-else-if="cellKind(nr[col]) === 'long-text'">
                      <textarea
                        class="table-textarea"
                        v-model="nr[col]"
                        :placeholder="col"
                        rows="3"
                      />
                    </template>
                    <input v-else class="table-input" v-model="nr[col]" :placeholder="col" />
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </template>
        </div>
      </section>

      <!-- 纯文本：字符串数组（如 自我评价段落） -->
      <section v-for="text in categorized.texts" :key="text.key" class="data-section">
        <h4 class="section-title">{{ text.label }}</h4>
        <div v-for="(para, pIdx) in editData[text.key]" :key="pIdx" class="intro-paragraph">
          <textarea
            class="self-intro"
            v-model="editData[text.key][pIdx]"
            rows="2"
            :placeholder="text.label + ' 段落 ' + (pIdx + 1)"
          />
        </div>
      </section>

      <!-- 兜底：无法识别的字段（如混合数组），用 JSON 展示，避免数据丢失 -->
      <section v-for="other in categorized.others" :key="other.key" class="data-section">
        <h4 class="section-title">{{ other.label }}</h4>
        <pre class="json-fallback">{{ prettyJson(editData[other.key]) }}</pre>
      </section>
    </div>
  </div>
</template>

<style scoped>
.file-preview {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f9f9f9;
}

.preview-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #fff;
  border-bottom: 1px solid #e0e0e0;
}

.preview-title {
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid #ddd;
  transition: all 0.15s;
}

.action-btn.cancel {
  background: #fff;
  color: #666;
}

.action-btn.cancel:hover {
  border-color: #f56c6c;
  color: #f56c6c;
}

.action-btn.confirm {
  background: #409eff;
  color: #fff;
  border-color: #409eff;
}

.action-btn.confirm:hover {
  background: #3a8ee6;
}

.action-btn.excel {
  background: #67c23a;
  color: #fff;
  border-color: #67c23a;
}

.action-btn.excel:hover:not(:disabled) {
  background: #5daf34;
  border-color: #5daf34;
}

.action-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.preview-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.doc-type {
  text-align: center;
  background: transparent;
  box-shadow: none;
  padding: 0;
}

.doc-type-title {
  font-size: 20px;
  font-weight: 700;
  color: #333;
  margin: 0 0 16px 0;
}

.data-section {
  margin-bottom: 24px;
  background: #fff;
  border-radius: 8px;
  padding: 16px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
  margin: 0 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid #f0f0f0;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 嵌套对象/字符串数组占满整行 */
.info-item-wide {
  grid-column: 1 / -1;
}

.json-fallback {
  margin: 0;
  padding: 8px 10px;
  background: #f5f7fa;
  border: 1px solid #e4e7ed;
  border-radius: 4px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  color: #444;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 240px;
  overflow: auto;
}

.info-label {
  font-size: 12px;
  color: #888;
}

.info-input {
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}

.info-input:focus {
  border-color: #409eff;
}

.table-input {
  width: 100%;
  border: none;
  padding: 4px 6px;
  font-size: 13px;
  outline: none;
  background: transparent;
}

.table-textarea {
  width: 100%;
  border: none;
  padding: 4px 6px;
  font-size: 13px;
  outline: none;
  background: transparent;
  resize: vertical;
  font-family: inherit;
  min-height: 40px;
}

.table-input:focus,
.table-textarea:focus {
  background: #f5f7fa;
}

.table-group {
  margin-bottom: 12px;
}

.table-group:last-child {
  margin-bottom: 0;
}

.sub-section {
  margin-left: 16px;
  margin-top: 8px;
}

.sub-title {
  font-size: 13px;
  color: #666;
  margin: 0 0 8px 0;
}

.self-intro {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  resize: vertical;
  font-family: inherit;
  outline: none;
  box-sizing: border-box;
}

.self-intro:focus {
  border-color: #409eff;
}

.intro-paragraph {
  margin-bottom: 8px;
}

.intro-paragraph:last-child {
  margin-bottom: 0;
}
</style>
