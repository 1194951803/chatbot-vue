<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  data: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['confirm', 'cancel'])

// 深拷贝供编辑
const editData = ref({})

// 判断值是否适合在网格中展示（字符串或数字）
function isPrimitive(value) {
  return typeof value === 'string' || typeof value === 'number'
}

// 通用渲染：按字段类型分类
function categorizeFields(data) {
  const grids = []     // { label, key } 对象字段 → 网格表单
  const tables = []    // { label, key } 数组字段 → 表格
  const texts = []     // { label, key } 纯文本/数组文本 → textarea

  for (const [key, value] of Object.entries(data || {})) {
    if (Array.isArray(value)) {
      // 检查是否是字符串数组（如自我介绍段落）
      if (value.length > 0 && typeof value[0] === 'string') {
        texts.push({ label: key, key })
      } else if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
        tables.push({ label: key, key })
      } else {
        grids.push({ label: key, key })
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      grids.push({ label: key, key })
    } else if (isPrimitive(value)) {
      grids.push({ label: key, key })
    }
  }

  return { grids, tables, texts }
}

const categorized = computed(() => categorizeFields(editData.value))

function getTableColumns(rows) {
  if (!rows || rows.length === 0) return []
  // 过滤掉嵌套对象，只取简单字段
  return Object.keys(rows[0]).filter((k) => !Array.isArray(rows[0][k]) && typeof rows[0][k] !== 'object')
}

function getTableRows(row, col) {
  // 嵌套的数组字段（如工作经历中的项目列表）
  const nested = row[col]
  if (Array.isArray(nested) && nested.length > 0 && typeof nested[0] === 'object') {
    return nested
  }
  return []
}

function nestedColumns(rows) {
  if (!rows || rows.length === 0) return []
  return Object.keys(rows[0]).filter((k) => !Array.isArray(rows[0][k]))
}
</script>

<template>
  <div class="file-preview">
    <div class="preview-header">
      <h3 class="preview-title">文件数据预览</h3>
      <div class="header-actions">
        <button class="action-btn cancel" @click="handleCancel">取消</button>
        <button class="action-btn confirm" @click="handleConfirm">确认提交</button>
      </div>
    </div>

    <div class="preview-content">
      <!-- 文档类型标题 -->
      <section v-if="editData['文档类型']" class="data-section doc-type">
        <h2 class="doc-type-title">{{ editData['文档类型'] }}</h2>
      </section>

      <!-- 网格表单：对象字段（如 个人信息） -->
      <section v-for="grid in categorized.grids" :key="grid.key" class="data-section">
        <h4 class="section-title">{{ grid.label }}</h4>
        <div class="info-grid">
          <template v-if="typeof editData[grid.key] === 'object' && !Array.isArray(editData[grid.key])">
            <div
              v-for="(value, subKey) in editData[grid.key]"
              :key="subKey"
              class="info-item"
              v-if="isPrimitive(value)"
            >
              <label class="info-label">{{ subKey }}</label>
              <input class="info-input" v-model="editData[grid.key][subKey]" :placeholder="subKey" />
            </div>
          </template>
          <template v-else-if="isPrimitive(editData[grid.key])">
            <div class="info-item">
              <label class="info-label">{{ grid.label }}</label>
              <input class="info-input" v-model="editData[grid.key]" :placeholder="grid.label" />
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
              v-for="col in getTableColumns([row])"
              :key="col"
              :prop="col"
              :label="col"
              min-width="120"
            >
              <template #default="{ row: r }">
                <textarea
                  v-if="Array.isArray(r[col]) && r[col].length > 0 && typeof r[col][0] === 'string'"
                  class="table-textarea"
                  v-model="r[col]"
                  :placeholder="col"
                  rows="2"
                />
                <input v-else class="table-input" v-model="r[col]" :placeholder="col" />
              </template>
            </el-table-column>
          </el-table>

          <!-- 嵌套数组（如工作经历中的项目列表） -->
          <div v-for="nested in [getTableRows(row, '项目列表') || getTableRows(row, 'projects')]" v-if="nested && nested.length > 0" :key="table.key + '-' + rIdx + '-nested'" class="sub-section">
            <h5 class="sub-title">项目列表</h5>
            <el-table :data="nested" border size="small" style="width: 100%">
              <el-table-column
                v-for="col in nestedColumns(nested)"
                :key="col"
                :prop="col"
                :label="col"
                min-width="100"
              >
                <template #default="{ row: nr }">
                  <textarea
                    v-if="Array.isArray(nr[col]) && nr[col].length > 0 && typeof nr[col][0] === 'string'"
                    class="table-textarea"
                    v-model="nr[col]"
                    :placeholder="col"
                    rows="2"
                  />
                  <input v-else class="table-input" v-model="nr[col]" :placeholder="col" />
                </template>
              </el-table-column>
            </el-table>
          </div>
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
