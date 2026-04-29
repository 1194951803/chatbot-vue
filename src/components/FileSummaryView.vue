<script setup>
import { ref } from 'vue'

const props = defineProps({
  summaryData: {
    type: Array,
    default: () => [],
  },
})

const emit = defineEmits(['confirm', 'cancel'])

// Mock 数据（后续替换为后端 API）
const mockData = [
  { index: 1, name: '倪晓晴', phone: '15624953624', email: '15624953624@163.com' },
  { index: 2, name: '张伟', phone: '13812345678', email: 'zhangwei@example.com' },
  { index: 3, name: '李思雨', phone: '18687654321', email: 'lisiyu@example.com' },
]

const displayData = ref(props.summaryData.length > 0 ? props.summaryData : mockData)
const selectedRows = ref([])

function handleSelectionChange(rows) {
  selectedRows.value = rows
}

function handleConfirm() {
  emit('confirm', selectedRows.value)
}

function handleCancel() {
  emit('cancel')
}
</script>

<template>
  <div class="file-summary">
    <div class="summary-header">
      <h3 class="summary-title">文件数据汇总</h3>
      <div class="header-actions">
        <button class="action-btn cancel" @click="handleCancel">关闭</button>
        <button class="action-btn confirm" @click="handleConfirm">确认提交</button>
      </div>
    </div>

    <div class="summary-content">
      <el-table
        :data="displayData"
        border
        stripe
        style="width: 100%"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" align="center" />
        <el-table-column type="index" label="序号" width="60" align="center" />
        <el-table-column prop="name" label="姓名" min-width="100" />
        <el-table-column prop="phone" label="手机号" width="130" />
        <el-table-column prop="email" label="邮箱" min-width="180" show-overflow-tooltip />
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

.summary-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  background-color: white;
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
