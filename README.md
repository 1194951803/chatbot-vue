# vue-chatbot

基于 Vue 3 + Vite 8 的可嵌入 Web 聊天机器人 UI，支持多模式交互（智能客服 / 文件转换 / 人才发展 / 员工自助），通过 SSE 流式响应与后端 AI 智能体通信。

## 功能特性

- **智能对话** — 支持 Markdown 渲染、代码高亮、消息反馈（复制/赞/踩/重新生成）
- **多模式切换** — 快捷按钮一键切换：智能客服、文件转换、人才发展、员工自助
- **会话管理** — 后端 API 驱动的会话列表/创建/删除/历史加载
- **文件转换** — STS 直传 OSS → 批量 SSE 流式解析 → 实时状态展示 → 单文件预览编辑 → 多文件汇总表格 → 确认提交
- **数据汇总** — 全部文件解析完成后展示汇总表格，支持行选择与批量提交
- **员工自助** — 自然语言意图识别，交互式卡片（请假/薪酬/个人信息/申请记录）
- **响应式布局** — 小窗口 380x520px / 最大化 90vw x 90vh / 移动端全屏

## 技术栈

| 类别 | 技术 |
|---|---|
| 前端框架 | Vue 3（Composition API + `<script setup>`） |
| 构建工具 | Vite 8 |
| UI 库 | Element Plus |
| 状态管理 | Pinia |
| HTTP 请求 | Axios（普通请求）+ fetch（流式响应） |
| Markdown 渲染 | markdown-it |
| 代码高亮 | highlight.js |

## 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 生产构建
npm run build

# 预览构建结果
npm run preview
```

开发服务器默认运行在 `http://localhost:5173`。

## 部署

### Nginx 配置

前端通过 Nginx 代理访问，后端 API 通过同一域名转发：

```nginx
# 前端
location /chatbotui {
    proxy_pass http://localhost:5173;
}

# 后端 API
location / {
    proxy_pass http://localhost:8088;
}
```

### Vite 配置

```js
export default defineConfig({
  base: '/chatbotui',   // 必须匹配 Nginx location 路径
  server: { port: 5173 },
})
```

前端 `baseURL` 设为空字符串（相对路径），请求 `/ai/api/...` 由 Nginx 的 `location /` 自动转发到后端。

## 全局配置

通过 `index.html` 中的 `window.CHATBOT_CONFIG` 注入配置：

```js
window.CHATBOT_CONFIG = {
  baseUrl: '',              // API 基础地址，默认空字符串（由 Nginx 代理）
  title: 'AI 助手',         // 窗口标题
  greeting: '你好！...',    // 问候语
  token: '',                // 认证 token
  avatars: {                // 各模式头像 URL
    customerService: '',
    fileConvert: '',
    talentAgent: '',
    employeeSelf: '',
  },
  allowedFileTypes: ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv', '.png', '.jpg', '.jpeg'],
  maxFileSize: 50 * 1024 * 1024,                // 最大文件大小（50MB）
  quickActions: [           // 快捷操作按钮
    { label: '人才发展', mode: 'talent_agent' },
    { label: '文件转换', mode: 'file_convert' },
    { label: '员工自助', mode: 'employee_self' },
  ],
  mockExtract: false,       // 是否使用模拟数据（调试用）
}
```

## 项目结构

```
src/
├── main.js                          # 入口文件，挂载到 #ballChat
├── App.vue                          # 根组件，渲染 ChatbotContainer
├── style.css                        # 全局样式
├── api/
│   ├── request.js                   # Axios 基础配置
│   ├── chat.js                      # 聊天消息接口
│   ├── file.js                      # 文件 STS/OSS 上传、批量 SSE 解析、汇总、确认提交
│   ├── agent.js                     # 人才发展智能体接口
│   └── session.js                   # 会话管理接口（列表/创建/删除/历史）
├── components/
│   ├── ChatbotContainer.vue         # 聊天窗口容器（显示/隐藏/最大化/侧边栏/分栏）
│   ├── Chatbot.vue                  # 聊天核心（消息列表/输入框/发送/停止/快捷按钮）
│   ├── MessageBubble.vue            # 消息气泡（Markdown/反馈/卡片/文件列表）
│   ├── SessionList.vue              # 会话列表侧边栏
│   ├── FileUpload.vue               # 文件上传面板（STS 直传 OSS）
│   ├── FileExtractStatus.vue        # 文件提取加载指示器
│   ├── FilePreview.vue              # 单文件数据预览编辑（表单/表格/textarea）
│   ├── FileListMessage.vue          # 批量文件列表消息（状态展示/预览/重试/汇总）
│   └── FileSummaryView.vue          # 多文件数据汇总表格（行选择/批量提交）
├── stores/
│   ├── chat.js                      # 聊天状态（消息/流式/中断/历史加载）
│   ├── session.js                   # 会话管理（后端 API：列表/创建/删除/历史）
│   ├── file.js                      # 文件处理（上传/解析状态/预览/汇总视图）
│   └── mode.js                      # 模式管理（客服/文件转换/人才发展/员工自助）
├── utils/
│   ├── stream.js                    # SSE 流式响应处理
│   ├── markdown.js                  # Markdown 渲染 + 代码高亮
│   ├── jsonParser.js                # 从 Markdown 中提取 JSON
│   └── normalizeExtractData.js      # 中文 key 转英文 key
├── mock/
│   └── extractData.js               # 模拟文件提取数据
└── config/
    └── index.js                     # window.CHATBOT_CONFIG 解析
```

## 架构说明

### 流式响应

后端 Spring MVC 通过 `ResponseBodyEmitter` 返回 SSE 格式数据，前端基于 `fetch` + `ReadableStream` 处理：

```
data:{"output":{"text":"增量文本","finish_reason":null},"request_status":false}
```

后端配置 `.incrementalOutput(true)` 返回增量文本，前端通过 `chatStore.appendStreamContent()` 追加拼接。

### 多模式路由

| 模式 | 用户发送消息时 | 接口 |
|---|---|---|
| 智能客服 | 正常后端请求 | `/ai/api/chatbot/chat` |
| 人才发展 | 正常后端请求 | `/ai/api/person/post/match` |
| 文件转换 | 正常聊天 + 文件处理 | `/ai/api/chatbot/chat` |
| 员工自助 | 本地拦截，不请求后端 | 意图识别 + mock 卡片 |

### 文件转换流程

**上传**：调用 `GET /ai/api/file/sts` 获取临时凭证 → 使用 `ali-oss` SDK 直传 OSS → 返回带签名的公网 URL

**批量解析**：前端 POST `{ index, fileName, ossUrl }[]` 到 `/ai/api/file/batch/parse` → 后端 SSE 流式返回（`event:file` 逐个推送，`event:done` 汇总）→ 前端实时更新文件状态

**状态展示**：对话流中插入 `FileListMessage` 组件，实时显示每个文件的解析状态（解析中/已提取/解析失败）

**预览编辑**：点击"查看"打开 `FilePreview` 组件，支持编辑表单/表格/文本域

**数据汇总**：全部文件解析完成后出现"查看汇总"按钮，点击打开 `FileSummaryView` 汇总表格，支持行选择与批量提交

**确认提交**：POST `/ai/api/file/confirm` 提交单个文件数据；汇总页面"确认提交"待对接 `/ai/api/file/summary`

**单文件重试**：POST `/ai/api/file/retry` 单独重试失败文件

### SSE 解析器

`src/api/file.js` 中的 `createStreamProcessor` 自动检测 SSE / NDJSON 格式：
- SSE 格式：按 `event:` / `data:` 解析，支持 `file` / `done` / `error` 事件
- NDJSON 格式：逐行 JSON 解析，含 `successCount`/`joinedFileIds` 的汇总行触发 `onDone`
- 通过 `doneState` 对象防止 `onDone` 重复触发

## 许可证

MIT
