<script setup>
import { ref, computed, onMounted } from 'vue'

const props = defineProps({
  data: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['confirm', 'cancel'])

// 深拷贝供编辑
const editData = ref({})

// 基本信息数据源：优先取 basicInfo 字段，否则取顶层过滤后的数据
const basicInfoData = computed(() => {
  if (editData.value.basicInfo && typeof editData.value.basicInfo === 'object') {
    return editData.value.basicInfo
  }
  // 过滤掉已知的非基本信息字段
  const skipKeys = ['identity', 'education', 'workExperience', 'skills', 'certificates', 'selfIntroduction', 'projects']
  const result = {}
  for (const key of Object.keys(editData.value)) {
    if (!skipKeys.includes(key)) {
      result[key] = editData.value[key]
    }
  }
  return result
})

onMounted(() => {
  editData.value = JSON.parse(JSON.stringify(props.data))
})

function handleConfirm() {
  emit('confirm', editData.value)
}

function handleCancel() {
  emit('cancel')
}

// 更新 basicInfo 中某个字段的值
function updateBasicInfo(key, value) {
  if (editData.value.basicInfo && typeof editData.value.basicInfo === 'object') {
    editData.value.basicInfo[key] = value
  } else {
    editData.value[key] = value
  }
}

// 获取字段值
function getBasicValue(key) {
  if (editData.value.basicInfo && typeof editData.value.basicInfo === 'object') {
    return editData.value.basicInfo[key]
  }
  return editData.value[key]
}

// 标准化技能数据为表格格式
function normalizeSkills() {
  const skills = editData.value.skills
  if (!skills || !skills.length) return []
  return skills.map(s => typeof s === 'string' ? { skill: s } : s)
}

// 获取技能列名
function getSkillColumns() {
  const normalized = normalizeSkills()
  if (normalized.length > 0) {
    return Object.keys(normalized[0])
  }
  return ['skill']
}

// 获取教育列名
function getEducationColumns() {
  const edu = editData.value.education
  if (edu && edu.length > 0) {
    return Object.keys(edu[0])
  }
  return []
}

// 获取证书列名
function getCertificateColumns() {
  const certs = editData.value.certificates
  if (certs && certs.length > 0) {
    return Object.keys(certs[0])
  }
  return []
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
      <!-- 唯一标识 -->
      <section v-if="editData.identity && typeof editData.identity === 'object'" class="data-section">
        <h4 class="section-title">唯一标识</h4>
        <div class="info-grid">
          <div v-for="(value, key) in editData.identity" :key="key" class="info-item">
            <label class="info-label">{{ key }}</label>
            <input
              v-if="typeof value === 'string' || typeof value === 'number'"
              class="info-input"
              v-model="editData.identity[key]"
              :placeholder="key"
            />
          </div>
        </div>
      </section>

      <!-- 基本信息 -->
      <section v-if="Object.keys(basicInfoData).length" class="data-section">
        <h4 class="section-title">基本信息</h4>
        <div class="info-grid">
          <div
            v-for="(value, key) in basicInfoData"
            :key="key"
            class="info-item"
            v-if="typeof value === 'string' || typeof value === 'number'"
          >
            <label class="info-label">{{ key }}</label>
            <input
              class="info-input"
              v-model="editData.basicInfo[key]"
              v-if="editData.basicInfo && typeof editData.basicInfo === 'object'"
              :placeholder="key"
            />
            <input
              class="info-input"
              v-model="editData[key]"
              v-else
              :placeholder="key"
            />
          </div>
        </div>
      </section>

      <!-- 教育背景 -->
      <section v-if="editData.education && editData.education.length" class="data-section">
        <h4 class="section-title">教育背景</h4>
        <el-table :data="editData.education" border size="small" style="width: 100%">
          <el-table-column
            v-for="col in getEducationColumns()"
            :key="col"
            :prop="col"
            :label="col"
            min-width="120"
          >
            <template #default="{ row }">
              <input class="table-input" v-model="row[col]" :placeholder="col" />
            </template>
          </el-table-column>
        </el-table>
      </section>

      <!-- 工作经历 -->
      <section v-if="editData.workExperience && editData.workExperience.length" class="data-section">
        <h4 class="section-title">工作经历</h4>
        <div v-for="(work, wIdx) in editData.workExperience" :key="wIdx" class="work-entry">
          <el-table :data="[work]" border size="small" style="width: 100%; margin-bottom: 8px">
            <el-table-column
              v-for="col in Object.keys(work).filter(k => k !== 'projects')"
              :key="col"
              :prop="col"
              :label="col"
              min-width="120"
            >
              <template #default="{ row }">
                <input class="table-input" v-model="row[col]" :placeholder="col" />
              </template>
            </el-table-column>
          </el-table>

          <!-- 嵌套项目经历 -->
          <div v-if="work.projects && work.projects.length" class="sub-section">
            <h5 class="sub-title">项目经历</h5>
            <el-table :data="work.projects" border size="small" style="width: 100%">
              <el-table-column
                v-for="col in (work.projects[0] ? Object.keys(work.projects[0]) : [])"
                :key="col"
                :prop="col"
                :label="col"
                min-width="100"
              >
                <template #default="{ row }">
                  <input class="table-input" v-model="row[col]" :placeholder="col" />
                </template>
              </el-table-column>
            </el-table>
          </div>
        </div>
      </section>

      <!-- 技能 -->
      <section v-if="editData.skills && editData.skills.length" class="data-section">
        <h4 class="section-title">技能</h4>
        <el-table :data="normalizeSkills()" border size="small" style="width: 100%">
          <el-table-column
            v-for="col in getSkillColumns()"
            :key="col"
            :prop="col"
            :label="col"
            min-width="120"
          >
            <template #default="{ row }">
              <input class="table-input" v-model="row[col]" :placeholder="col" />
            </template>
          </el-table-column>
        </el-table>
      </section>

      <!-- 证书 -->
      <section v-if="editData.certificates && editData.certificates.length" class="data-section">
        <h4 class="section-title">证书</h4>
        <el-table :data="editData.certificates" border size="small" style="width: 100%">
          <el-table-column
            v-for="col in getCertificateColumns()"
            :key="col"
            :prop="col"
            :label="col"
            min-width="120"
          >
            <template #default="{ row }">
              <input class="table-input" v-model="row[col]" :placeholder="col" />
            </template>
          </el-table-column>
        </el-table>
      </section>

      <!-- 自我介绍 -->
      <section v-if="editData.selfIntroduction" class="data-section">
        <h4 class="section-title">自我介绍</h4>
        <template v-if="Array.isArray(editData.selfIntroduction)">
          <div v-for="(para, pIdx) in editData.selfIntroduction" :key="pIdx" class="intro-paragraph">
            <textarea
              class="self-intro"
              v-model="editData.selfIntroduction[pIdx]"
              rows="2"
              :placeholder="'段落 ' + (pIdx + 1)"
            />
          </div>
        </template>
        <textarea
          v-else
          class="self-intro"
          v-model="editData.selfIntroduction"
          rows="4"
          placeholder="自我介绍"
        />
      </section>

      <!-- 兜底：渲染未处理的字段 -->
      <section
        v-if="Object.keys(editData).some(k => !['identity', 'basicInfo', 'education', 'workExperience', 'skills', 'certificates', 'selfIntroduction'].includes(k))"
        class="data-section"
      >
        <h4 class="section-title">其他信息</h4>
        <div class="info-grid">
          <div
            v-for="(value, key) in editData"
            :key="'other-' + key"
            class="info-item"
            v-if="!['identity', 'basicInfo', 'education', 'workExperience', 'skills', 'certificates', 'selfIntroduction'].includes(key)"
          >
            <label class="info-label">{{ key }}</label>
            <textarea
              v-if="typeof value === 'object' && value !== null && !Array.isArray(value)"
              class="info-textarea"
              :value="JSON.stringify(value, null, 2)"
              @input="editData[key] = $event.target.value"
              rows="3"
            />
            <input
              v-else-if="typeof value === 'string' || typeof value === 'number'"
              class="info-input"
              v-model="editData[key]"
              :placeholder="key"
            />
            <div v-else class="info-read-only">{{ typeof value === 'object' ? JSON.stringify(value) : value }}</div>
          </div>
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
  text-transform: capitalize;
}

.info-input,
.info-textarea {
  padding: 6px 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}

.info-input:focus,
.info-textarea:focus {
  border-color: #409eff;
}

.info-textarea {
  resize: vertical;
  font-family: inherit;
}

.table-input {
  width: 100%;
  border: none;
  padding: 4px 6px;
  font-size: 13px;
  outline: none;
  background: transparent;
}

.table-input:focus {
  background: #f5f7fa;
}

.work-entry {
  margin-bottom: 12px;
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

.info-read-only {
  font-size: 13px;
  color: #666;
  word-break: break-all;
}

</style>
