<script setup>
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { batchDownloadExcel } from '../api/file'

const props = defineProps({
  // 由父组件传入的解析记录列表（fileStore.fileRecords）
  fileRecords: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['confirm', 'cancel'])

// ===== 字段别名表（兼容不同后端返回 key） =====
const NAME_KEYS = ['姓名', 'name', '主体姓名', '持有人', '员工姓名']
const PHONE_KEYS = ['手机号', '联系电话', '电话', 'phone', 'mobile', '手机']
const EMAIL_KEYS = ['邮箱', '电子邮件', 'email', 'mail']
const CERT_NAME_KEYS = ['证书名称', 'certName', 'name']
const CERT_NO_KEYS = ['证书编号', '证书号', '编号', 'certNo', 'id', 'certId']
const CERT_ARRAY_KEYS = ['技能证书', '证书', '证书信息', 'certificates']
const PERSON_CONTAINER_KEYS = ['基本信息', '唯一标识', '个人信息', '基础信息']

function findFirst(obj, keys) {
  if (!obj || typeof obj !== 'object') return ''
  for (const k of keys) {
    const v = obj[k]
    if (v != null && v !== '' && (typeof v === 'string' || typeof v === 'number')) {
      return String(v)
    }
  }
  return ''
}

// 在顶层 + 常见嵌套容器里查找第一个命中字段
function deepFindFirst(data, keys) {
  if (!data || typeof data !== 'object') return ''
  const direct = findFirst(data, keys)
  if (direct) return direct
  for (const ck of PERSON_CONTAINER_KEYS) {
    const sub = data[ck]
    const v = findFirst(sub, keys)
    if (v) return v
  }
  return ''
}

function pickArray(obj, keys) {
  if (!obj || typeof obj !== 'object') return []
  for (const k of keys) {
    if (Array.isArray(obj[k])) return obj[k]
  }
  return []
}

// 文档类型分类：决定生成哪些行
function classifyDocType(data) {
  const t = String(data?.['文档类型'] || '').toLowerCase()
  if (/简历|个人/.test(t)) return 'resume'
  if (/证书|证照|证件/.test(t)) return 'cert'
  if (!t) {
    if (data?.['基本信息'] || data?.['唯一标识'] || data?.['个人信息']) return 'resume'
    if (data?.['证书名称'] || data?.['证书编号']) return 'cert'
  }
  return 'other'
}

// 把 fileRecords 展开成 [{ index, dataType, subjectName, info1, info2, _meta }]
function buildRows(records) {
  const rows = []
  let idx = 1
  for (const record of records || []) {
    const data = record?.extractedData
    if (!data || typeof data !== 'object') continue

    const type = classifyDocType(data)
    const subjectName = deepFindFirst(data, NAME_KEYS)

    if (type === 'resume') {
      rows.push({
        index: idx++,
        dataType: '人员信息',
        subjectName,
        info1: deepFindFirst(data, PHONE_KEYS),
        info2: deepFindFirst(data, EMAIL_KEYS),
        _meta: { fileId: record.fileId, fileName: record.fileName, kind: 'person' },
      })

      // 简历内嵌证书清单 → 每条一行
      const certs = pickArray(data, CERT_ARRAY_KEYS)
      certs.forEach((cert, ci) => {
        if (!cert || typeof cert !== 'object') return
        rows.push({
          index: idx++,
          dataType: '证书信息',
          subjectName,
          info1: findFirst(cert, CERT_NAME_KEYS),
          info2: findFirst(cert, CERT_NO_KEYS),
          _meta: {
            fileId: record.fileId,
            fileName: record.fileName,
            kind: 'cert',
            certIndex: ci,
          },
        })
      })
    } else if (type === 'cert') {
      // 顶层就是证书数据
      rows.push({
        index: idx++,
        dataType: '证书信息',
        subjectName:
          subjectName
          || findFirst(data['产品信息'], ['产品名称'])
          || findFirst(data, ['产品名称', '持有人']),
        info1: findFirst(data, CERT_NAME_KEYS),
        info2: findFirst(data, CERT_NO_KEYS),
        _meta: { fileId: record.fileId, fileName: record.fileName, kind: 'cert' },
      })
    } else {
      // 兜底：未识别类型，仍占一行避免数据丢失
      rows.push({
        index: idx++,
        dataType: data?.['文档类型'] || '其他信息',
        subjectName,
        info1: '',
        info2: '',
        _meta: { fileId: record.fileId, fileName: record.fileName, kind: 'other' },
      })
    }
  }
  return rows
}

const tableRows = computed(() => buildRows(props.fileRecords))

const tableRef = ref(null)
const selectedRows = ref([])
const generating = ref(false)

function handleSelectionChange(rows) {
  selectedRows.value = rows
}

function handleConfirm() {
  // 没勾选时默认全部提交
  const payload = selectedRows.value.length > 0 ? selectedRows.value : tableRows.value
  emit('confirm', payload)
}

function handleCancel() {
  emit('cancel')
}

// 根据勾选状态收集要导出的文件解析数据
function collectExportTargets() {
  const allRecords = (props.fileRecords || []).filter(
    (r) => r && r.extractedData && typeof r.extractedData === 'object',
  )
  if (selectedRows.value.length === 0) return allRecords

  // 勾选时按行的 fileId 去重，取对应 record（同一文件多行只取一份 extractedData）
  const selectedIds = new Set(
    selectedRows.value.map((r) => r?._meta?.fileId).filter((v) => v != null),
  )
  if (selectedIds.size === 0) return allRecords
  return allRecords.filter((r) => selectedIds.has(r.fileId))
}

async function handleGenerateExcel() {
  if (generating.value) return
  const targets = collectExportTargets()
  if (targets.length === 0) {
    ElMessage.warning('暂无可导出的数据')
    return
  }
  generating.value = true
  try {
    const jsonDataList = targets.map((r) => r.extractedData)
    const blob = await batchDownloadExcel(jsonDataList)
    triggerBlobDownload(blob, buildExcelFileName(targets.length))
    ElMessage.success('Excel 已生成并开始下载')
  } catch (err) {
    console.error('[BatchGenerateExcel Error]', err)
    ElMessage.error('生成 Excel 失败：' + (err?.message || '未知错误'))
  } finally {
    generating.value = false
  }
}

function buildExcelFileName(count) {
  const ts = new Date()
    .toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 14)
  return `数据汇总-${count}个文件-${ts}.xlsx`
}

function triggerBlobDownload(blob, fileName) {
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
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
</script>

<template>
  <div class="file-summary">
    <div class="summary-header">
      <h3 class="summary-title">文件数据汇总</h3>
      <div class="header-actions">
        <button class="action-btn cancel" @click="handleCancel">关闭</button>
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

    <div class="summary-content">
      <el-table
        ref="tableRef"
        :data="tableRows"
        border
        stripe
        empty-text="暂无可汇总的解析数据"
        style="width: 100%"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" align="center" />
        <el-table-column type="index" label="序号" width="60" align="center" />
<!--        <el-table-column prop="dataType" label="数据类型" width="110">
          <template #default="{ row }">
            <span
              class="type-tag"
              :class="{
                'type-person': row.dataType === '人员信息',
                'type-cert': row.dataType === '证书信息',
              }"
            >
              {{ row.dataType }}
            </span>
          </template>
        </el-table-column>-->
        <el-table-column prop="subjectName" label="姓名" min-width="100" show-overflow-tooltip />
        <el-table-column prop="info1" label="手机号" min-width="160" show-overflow-tooltip />
        <el-table-column prop="info2" label="邮箱" min-width="180" show-overflow-tooltip />
      </el-table>
    </div>
  </div>
</template>

<style scoped>
.file-summary {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #f5f7fa;
}

.summary-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  flex-shrink: 0;
}

.summary-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: #333;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.action-btn {
  padding: 6px 16px;
  border-radius: 4px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid #dcdfe6;
  transition: all 0.15s;
}

.action-btn.cancel {
  background: #fff;
  color: #606266;
}

.action-btn.cancel:hover {
  color: #409eff;
  border-color: #c6e2ff;
  background: #ecf5ff;
}

.action-btn.confirm {
  background: #409eff;
  color: #fff;
  border-color: #409eff;
}

.action-btn.confirm:hover {
  background: #66b1ff;
  border-color: #66b1ff;
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

.summary-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  background-color: white;
}

.type-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  border: 1px solid transparent;
}

.type-person {
  color: #409eff;
  background: #ecf5ff;
  border-color: #d9ecff;
}

.type-cert {
  color: #67c23a;
  background: #f0f9eb;
  border-color: #e1f3d8;
}

:deep(.el-table) {
  font-size: 13px;
}

:deep(.el-table th) {
  background: #f5f7fa;
  color: #606266;
  font-weight: 500;
}
</style>
