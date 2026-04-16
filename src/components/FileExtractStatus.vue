<script setup>
defineProps({
  message: {
    type: String,
    default: '正在提取文件内容...',
  },
})
</script>

<template>
  <div class="file-extract-status">
    <div class="spinner" />
    <p class="status-text">{{ message }}</p>
  </div>
</template>

<style scoped>
.file-extract-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px 20px;
  color: #666;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #e0e0e0;
  border-top-color: #409eff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.status-text {
  margin-top: 16px;
  font-size: 14px;
  color: #888;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
