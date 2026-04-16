# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## 项目概述

一个基于 Vue 3 的 Web 聊天机器人 UI 项目，用于嵌入到网页中作为 AI 助手组件。项目通过 Nginx 部署，后端通过 Spring MVC `ResponseBodyEmitter` 提供 SSE 流式响应。

## 技术栈

- **前端框架**: Vue 3（Composition API + `<script setup>`）
- **构建工具**: Vite 8
- **UI 库**: Element Plus
- **状态管理**: Pinia
- **HTTP 请求**: Axios（普通请求）+ fetch（流式响应）
- **Markdown 渲染**: markdown-it
- **代码高亮**: highlight.js

## 常用命令

```bash
npm run dev       # 启动开发服务器（localhost:5173）
npm run build     # 生产构建
npm run preview   # 预览构建结果
```

## 项目实际目录结构

```
src/
├── main.js                          # 入口文件，挂载到 #ballChat，注册 Pinia + Element Plus
├── App.vue                          # 根组件，渲染 ChatbotContainer
├── style.css                        # 全局样式重置
├── api/
│   ├── request.js                   # Axios 基础配置（baseURL 为空，由 Nginx 代理）
│   ├── chat.js                      # 聊天消息接口
│   ├── file.js                      # 文件上传/状态/提取/转换接口
│   └── agent.js                     # 人才发展智能体接口
├── components/
│   ├── ChatbotContainer.vue         # 聊天窗口容器（显示/隐藏/最大化/侧边栏/分栏布局）
│   ├── Chatbot.vue                  # 聊天核心（消息列表、输入框、发送/停止、快捷按钮）
│   ├── MessageBubble.vue            # 消息气泡（Markdown 渲染 + 反馈工具栏 + 文件记录 + 交互式卡片）
│   ├── SessionList.vue              # 会话列表侧边栏（新建/切换/删除）
│   ├── FileUpload.vue               # 文件上传面板（拖拽/点击上传、进度条、文件校验）
│   ├── FileExtractStatus.vue        # 文件提取加载指示器（旋转动画）
│   └── FilePreview.vue              # 可编辑的文件数据预览（表单/表格/textarea 渲染）
├── stores/
│   ├── chat.js                      # 聊天状态（消息列表、流式响应、中断控制）
│   ├── session.js                   # 会话管理（列表、切换、localStorage 持久化）
│   ├── file.js                      # 文件处理（上传进度、状态轮询、提取状态、上传记录）
│   └── mode.js                      # 模式管理（客服/文件转换/人才发展）
├── utils/
│   ├── stream.js                    # SSE 流式响应处理（fetch + ReadableStream）
│   ├── markdown.js                  # Markdown 渲染 + 代码高亮
│   ├── jsonParser.js                # 从 Markdown 中提取并解析 JSON 代码块
│   ├── normalizeExtractData.js      # 将中文 key 的数据结构标准化为英文 key
│   └── storage.js                   # localStorage 封装
├── mock/
│   └── extractData.js               # 模拟文件提取数据（调试用）
└── config/
    └── index.js                     # window.CHATBOT_CONFIG 解析与默认值
```

## 入口文件

- `src/main.js` — 定位页面中的 `#ballChat` 元素并挂载聊天机器人。
- `index.html` — 挂载点为 `<div id="ballChat">`，语言设为 `zh-CN`。

## 部署架构

### Nginx 配置

前端通过 Nginx 代理访问，关键配置：

```nginx
# 前端：/chatbotui → localhost:5173
location /chatbotui {
    proxy_pass http://localhost:5173;
}

# 后端 API：/ → localhost:8088
location / {
    proxy_pass http://localhost:8088;
}
```

前端 `baseURL` 设为**空字符串**（相对路径），请求 `/ai/api/...` 由 Nginx 的 `location /` 自动转发到后端。

### Vite 配置

```js
// vite.config.js
export default defineConfig({
  base: '/chatbotui',   // 必须匹配 Nginx location 路径
  server: { port: 5173 },
})
```

### 后端流式响应格式

后端 Spring MVC 通过 `ResponseBodyEmitter` 返回 SSE 格式数据：

```text
id:1
event:result
:HTTP_STATUS/200
data:{"output":{"text":"增量文本","finish_reason":null},"request_status":false}
```

关键配置：`.incrementalOutput(true)` — 后端返回的是**增量文本**（每次只新增片段），前端需要拼接。

## 状态管理 (Pinia)

| Store | 职责 |
|---|---|
| `chatStore` | 消息列表、流式响应状态（isStreaming）、流式内容（currentStreamContent）、中断控制（abortController/abortStream）、`appendStreamContent` 追加增量 |
| `sessionStore` | 会话列表、当前会话 ID、新建/切换/删除、localStorage 持久化 |
| `fileStore` | 文件上传进度、状态轮询、文件提取状态（isExtracting/extractedData/previewMode）、上传记录列表（fileRecords） |
| `modeStore` | 当前模式（MODES 常量：customer_service/file_convert/talent_agent/employee_self）、头像切换 |

## 关键行为

### 流式响应

- 使用 `src/utils/stream.js` 的 `createStreamRequest` 函数，基于 `fetch` + `ReadableStream`。
- SSE 解析：按 `\n` 分行，提取 `data:` 后的 JSON，解析 `data.output.text` 获取增量文本。
- **中断机制**：`AbortController` 控制，用户发送新消息或点击"停止"时中断。
- 文本拼接：使用 `chatStore.appendStreamContent()` 追加增量内容（后端使用 `incrementalOutput(true)`）。
- `stream.js` 中的 IIFE 写法 `(async () => {})()` 在 Vite 构建时可能出错，已改为命名函数 `fetchStream()`。

### 消息收发

- 发送：Enter 键或点击发送按钮，Shift+Enter 换行。
- 模式路由：人才发展模式（`talent_agent`）走 `/ai/api/person/post/match`，普通模式走 `/ai/api/chatbot/chat`，员工自助模式（`employee_self`）不请求后端，本地意图识别 + mock 卡片响应。
- 请求参数：`{ prompt: content, sessionId: sessionId }`（注意是 `prompt` 字段，不是 `message`）。

### 文件转换流程

完整流程：**上传文件 → 轮询文件状态 → 提取结构化数据 → 左右分栏预览 → 确认提交**

1. **上传文件**：POST `/ai/api/file/upload`（multipart/form-data），返回文件 ID（纯字符串）
2. **轮询文件状态**：POST `/ai/api/file/status`（Content-Type: text/plain，body 为 fileId）
   - 每 2 秒轮询一次，最多 60 次（约 2 分钟）
   - 状态值：`INIT` → `PARSING` → `SAFE_CHECKING` → `INDEX_BUILDING` → `FILE_IS_READY`
   - 就绪状态：`FILE_IS_READY`、`PARSE_SUCCESS`、`INDEX_BUILD_SUCCESS`
   - 失败状态：`PARSE_FAILED`、`SAFE_CHECK_FAILED`、`INDEX_BUILDING_FAILED`、`FILE_EXPIRED`、`INDEX_DELETED`
3. **提取结构化数据**：POST `/ai/api/stream/analysis/extract`（SSE 流式响应）
   - 请求体：`{ fileId }`
   - 返回 Markdown 文本中的 JSON 代码块（```json ... ```）
   - 使用 `src/utils/jsonParser.js` 提取并解析 JSON
   - 使用 `src/utils/normalizeExtractData.js` 将中文 key 标准化为英文 key
4. **左右分栏预览**：自动最大化窗口，左侧聊天 + 右侧 `FilePreview` 可编辑预览
   - FilePreview 支持编辑：基本信息（表单网格）、教育/工作/技能/证书（Element Plus 表格）、自我介绍（textarea）
   - 工作经历含嵌套项目经历表格
5. **确认提交**：POST `/ai/api/file/confirm` 提交编辑后的数据
6. **文件记录**：每次上传会在聊天消息中添加一条 `type: 'file_upload'` 记录，显示文件名、时间、状态（uploaded/extracted）

### 文件转换布局

- **上传阶段**：自动最大化，显示 `FileUpload` 面板（拖拽区域 + 进度条 + 取消按钮）。面板通过 `.content-overlay` 覆盖层展示，宽度限制 `max-width: 600px` 居中显示
- **等待阶段**：显示 `FileExtractStatus` 加载指示器，动态显示状态提示文本。宽度同样限制 `max-width: 600px`
- **预览阶段**：`Chatbot` 聊天组件**始终存在**，`FilePreview` 条件性出现在右侧（`v-if="fileStore.previewMode && fileStore.extractedData"`）。两者通过 `.content-body` flex 容器左右分屏
- **关键架构**：去掉了 `isSplitMode` 变量和 `v-else-if` 互斥渲染链，改为 Chatbot 永不消失、FilePreview 按需出现的非互斥架构
- **侧边栏行为**：小窗口时侧边栏保持 `position: absolute` 覆盖式，大窗口时 `position: relative` 并排式。上传/提取覆盖层 z-index 20，固定式侧边栏 z-index 25 不被覆盖
- **上传完成逻辑**：`handleUploadComplete` 中设置 `showUploadPanel = false` 关闭上传面板，由文件状态轮询接管后续流程

### 模拟模式（调试用）

通过 `window.CHATBOT_CONFIG.mockExtract = true` 启用，跳过真实提取接口，直接使用本地 mock 数据进入预览模式。

### 员工自助（纯对话式交互）

员工自助功能通过**自然语言**在现有对话流中触发，不使用独立组件（已删除 `EmployeeService.vue`）。

**交互流程**：

```
用户点击"员工自助"按钮 → 按钮变蓝 → mode → employee_self
    ↓ AI 发送问候文本（提示可用功能）
    ↓ 用户输入自然语言，如"我想明天上午请假"
AI 识别意图 → 发送对应卡片（mock 数据 + 确认提交按钮）
    ↓ 用户点击"确认提交"
AI 发送提交成功文本消息
    ↓ 用户再次点击"员工自助"按钮 → 按钮恢复白色
mode → customer_service + 系统提示退出消息
```

**关键实现**：

- **快捷按钮 Toggle**（`Chatbot.vue` `handleQuickAction`）：当前已是该模式时退出到 `CUSTOMER_SERVICE`，否则进入该模式
- **模式监听**（`watch` on `modeStore.currentMode`）：进入 `EMPLOYEE_SELF` 时发送问候消息；退出时发送系统提示
- **`handleSend` 拦截**：`employee_self` 模式下不请求后端，通过 `detectIntent()` 正则识别意图 + `generateMockCard()` 生成卡片消息
- **意图识别**：`detectIntent()` 使用正则匹配关键词：

| 关键词 | 意图 | 响应 |
|---|---|---|
| 请假/休假/调休 | `leave` | `leave_form` 卡片 |
| 薪酬/工资/工资条 | `salary` | `salary` 卡片 |
| 个人信息/信息/简历/个人资料 | `profile` | `profile` 卡片 |
| 记录/申请记录/历史 | `records` | `records` 卡片 |
| 年度考核/年度评价 | `annual_review` | 文本"功能开发中" |
| 绩效目标/OKR | `performance` | 文本"功能开发中" |
| 其他 | 无匹配 | 文本"未识别意图"提示 |

- **交互式卡片**（`MessageBubble.vue`）：新增 `type === 'interactive_card'` 渲染分支，支持 `leave_form`/`profile`/`salary`/`records` 四种卡片。**注意**：该分支必须在 `role === 'assistant'` 之前判断，因为卡片消息也有 `role: 'assistant'`，否则会被 assistant 分支拦截
- **卡片操作处理**（`Chatbot.vue` `handleCardAction`）：通过 `@card-action` 事件接收操作，`confirm_leave` 发送成功消息，`cancel` 发送取消消息
- **反馈组件隐藏**：所有员工自助消息标记 `noFeedback: true`，`MessageBubble.vue` 的 `showActions` computed 会跳过这些消息

**Mock 数据结构**：

- **请假单**（`leave_form`）：type、startDate、endDate、reason、status，带确认提交/取消按钮
- **个人信息**（`profile`）：name、dept、position、employeeNo、joinDate、email、phone
- **薪酬详情**（`salary`）：month、baseSalary、performance、allowance、grossSalary、socialSecurity、housingFund、tax、netSalary
- **申请记录**（`records`）：数组，每项含 type、title、date、status

### 人才发展（对话式 + 后端流式响应）

人才发展模式通过**自然语言**与后端智能体交互，使用流式 SSE 响应。

**交互流程**：

```
用户点击"人才发展"按钮 → 按钮变蓝 → mode → talent_agent
    ↓ AI 发送问候文本（提示可描述岗位需求或人员信息）
    ↓ 用户输入自然语言，如"我需要一名有 5 年经验的前端工程师"
AI 调用后端 /ai/api/person/post/match（SSE 流式响应）
    ↓ 返回 Markdown 格式的推荐结果
    ↓ 用户再次点击"人才发展"按钮 → 按钮恢复白色
mode → customer_service + 系统提示退出消息
```

**关键实现**：

- **模式监听**（`watch` on `modeStore.currentMode`）：进入 `TALENT_AGENT` 时发送问候消息；退出时发送系统提示
- **`handleSend` 不拦截**：人才发展模式**不走本地拦截**，直接根据模式选择后端接口
- **接口路由**：`TALENT_AGENT` 模式使用 `/ai/api/person/post/match`，其他模式使用 `/ai/api/chatbot/chat`
- **流式响应**：与普通模式共用 `createStreamRequest` 处理 SSE 增量文本拼接
- **反馈组件显示**：人才发展模式的消息**不标记** `noFeedback`，正常显示复制/赞/踩/重新生成工具栏

**与员工自助的区别**：

| 维度 | 员工自助 | 人才发展 |
|---|---|---|
| 后端请求 | 不请求后端，本地 mock | 走后端 `/ai/api/person/post/match` |
| 响应方式 | 本地意图识别 + mock 卡片 | SSE 流式 Markdown |
| 反馈工具栏 | 隐藏（noFeedback） | 正常显示 |

### 消息气泡

- **Markdown 渲染**：`renderMarkdown` 通过 markdown-it 渲染，`<p>` 标签 margin 设为 `4px 0`，首尾段落 `margin: 0`，保证单行文本紧凑不出现多余空白
- **反馈工具栏**：仅流式响应完成的 assistant 消息显示（`showActions` computed），标记 `noFeedback` 的系统/问候消息不显示
- **交互式卡片**：`type === 'interactive_card'` 模板必须在 `role === 'assistant'` 之前判断，否则被 assistant 分支拦截

### 消息反馈

AI 回复完成后（非流式中）显示反馈工具栏：

- **复制** — `navigator.clipboard.writeText()` 复制内容，失败回退 `execCommand('copy')`，显示"已复制"，2秒恢复
- **赞** — 切换选中状态，当前仅 console.log，待对接 `/ai/api/chatbot/feedback`
- **踩** — 切换选中状态，当前仅 console.log，待对接反馈接口
- **重新生成** — 向上查找最近的用户消息，删除之后的所有回复，用原问题重新发送

### 会话管理

- **新建会话**：创建带时间戳的会话 ID，标题为"新会话"，添加到列表首位
- **切换会话**：切换 `currentSessionId`，清空当前消息
- **删除会话**：从列表中移除，若删除的是当前会话则自动切换到第一个
- **持久化**：`localStorage` 存储，key 为 `chatbot_sessions`
- **历史加载**：切换会话时仅清空当前消息，TODO 需从后端加载历史

### 窗口适配

- **普通窗口**：380x520px，侧边栏 `position: absolute` 覆盖在聊天区域上，点击遮罩可关闭
- **最大化窗口**：90vw x 90vh，侧边栏 `position: relative` 与聊天区域并排显示
- **文件转换模式**：点击"文件转换"按钮时自动最大化，同时自动展开左侧会话列表。侧边栏在新建/切换会话时保持展开（不收起）
- **侧边栏自动行为**：最大化时 `showSidebar = true`（自动展开），还原时 `showSidebar = false`（收起）。文件转换模式下显式设置 `showSidebar = true`
- **侧边栏切换逻辑**：`handleNewSession` 和 `handleSelectSession` 仅在非最大化窗口下才收起侧边栏
- **消息居中布局**：最大化时消息区最大宽度 800px 居中展示，两侧留白；普通窗口最大宽度 720px
- **移动端**：屏幕宽度 <= 480px 时全屏
- 侧边栏宽度：普通 260px，>= 800px 时 280px

## API 端点

| 端点 | 用途 | 状态 |
|---|---|---|
| `/ai/api/chatbot/chat` | 聊天消息接口（流式响应） | 已对接 |
| `/ai/api/person/post/match` | 人才发现智能体接口（流式响应） | 已对接 |
| `/ai/api/file/upload` | 文件上传（返回 fileId 字符串） | 已对接 |
| `/ai/api/file/status` | 文件状态查询（POST，body 为 fileId 字符串） | 已对接 |
| `/ai/api/stream/analysis/extract` | 文件内容提取（SSE 流式） | 已对接 |
| `/ai/api/file/confirm` | 确认提交文件数据 | 已对接 |
| `/ai/api/file/excel` | 文件转 Excel 下载 | 待对接 |
| `/ai/api/chatbot/feedback` | 消息反馈上报（赞/踩） | 待对接 |

## 全局配置

通过 `window.CHATBOT_CONFIG` 注入，支持以下字段：

```js
window.CHATBOT_CONFIG = {
  baseUrl: '',          // API 基础地址，默认空字符串（由 Nginx 代理）
  title: 'AI 助手',     // 标题
  greeting: '...',      // 问候语
  token: '',            // 认证 token
  avatars: {            // 各模式头像 URL
    customerService: '',
    fileConvert: '',
    talentAgent: '',
    employeeSelf: '',
  },
  allowedFileTypes: ['.pdf', '.doc', '.docx'],  // 允许上传的文件类型
  maxFileSize: 50 * 1024 * 1024,  // 最大文件大小
  quickActions: [       // 快捷操作按钮
    { label: '人才发展', mode: 'talent_agent' },
    { label: '文件转换', mode: 'file_convert' },
    { label: '员工自助', mode: 'employee_self' },
  ],
  mockExtract: false,   // 是否使用模拟数据（调试用）
}
```

## Agent 工作流建议

```
需求阶段 → Product Manager 梳理 PRD 和功能需求
    ↓
设计阶段 → UX Architect 搭建 UI 架构 + CSS 系统
         → Brand Guardian 确定品牌视觉规范
    ↓
开发阶段 → Frontend Developer 实现组件和页面
         → Senior Developer 处理复杂逻辑（流式响应、文件处理）
    ↓
审查阶段 → Code Reviewer 代码质量和规范审查
```

| 场景 | 推荐 Agent |
|---|---|
| 梳理功能需求、写 PRD | Product Manager |
| UI 架构设计、CSS 系统搭建 | UX Architect |
| 品牌视觉规范、配色方案 | Brand Guardian |
| Vue 组件开发、页面实现 | Frontend Developer |
| 流式响应、文件处理等复杂逻辑 | Senior Developer |
| 代码审查、质量检查 | Code Reviewer |

## 技术决策记录

| 决策 | 说明 |
|---|---|
| 构建工具选用 Vite | 相比 Webpack，开发服务器启动更快、HMR 更流畅，与 Vue 3 + Element Plus 生态更契合 |
| 状态管理选用 Pinia | Vue 3 官方推荐，API 简洁 |
| 流式响应使用 fetch 而非 axios | axios 对 ReadableStream 支持不完整，改用原生 fetch |
| baseURL 使用空字符串 | 通过 Nginx 代理统一转发，避免跨域问题 |
| 暂不引入测试框架 | 项目初期以功能实现为主，测试后续补充 |
| 暂不引入国际化 | 当前仅中文场景 |
| 流式文本使用增量拼接 | 后端 `incrementalOutput(true)` 返回增量，前端用 `appendStreamContent` 追加 |
| stream.js 使用命名函数而非 IIFE | IIFE 写法 `(async () => {})()` 在 Vite 构建时出现类型转换错误 |
| 文件提取回调使用闭包变量 | `this` 在 onChunk 回调中不可用，改用闭包变量 `extractedText` |
| 文件上传接口返回纯字符串 | 后端直接返回 fileId 字符串，需兼容字符串和对象两种格式 |
| 文件状态查询使用 POST | 后端 `getFileStatus` 使用 `@RequestBody` 接收 fileId |
| JSON 提取三级回退策略 | 优先 ```json 代码块 → 普通 ``` 代码块 → 括号匹配 { } |
| 数据标准化层 | `normalizeExtractData.js` 将中文 key 映射为英文 key，供 FilePreview 统一处理 |
| `interactive_card` 模板必须在 `role === 'assistant'` 之前判断 | 卡片消息同时有 `role: 'assistant'`，放在后面会被 assistant 分支拦截 |
| 员工自助使用纯对话流 + 意图识别 | 不使用独立组件（已删除 EmployeeService.vue），在 Chatbot.vue 中拦截发送 |
| 系统消息标记 noFeedback | 非智能体生成的消息（问候/退出/卡片操作）标记 noFeedback，隐藏反馈工具栏 |
| Chatbot 组件始终渲染 | 去掉 `v-else-if` 互斥链，Chatbot 永不消失，FilePreview 条件性出现在右侧 |
| 上传覆盖层宽度约束 | `.content-overlay` 内通过 `.overlay-content` 限制 `max-width: 600px` 居中显示，防止填满大窗口 |
| 最大化时自动展开侧边栏 | `watch(isMaximized)` 同步 `showSidebar`，文件转换模式显式设置避免 watcher 时序问题 |
| 固定式侧边栏层级高于覆盖层 | `sidebar-fixed` z-index 25 > 覆盖层 z-index 20，防止被上传/提取覆盖层遮挡 |
| 消息气泡 p 标签紧凑布局 | `<p>` margin 设为 `4px 0`，首尾段落 `margin: 0`，解决单行文本下方多余空白 |
| 人才发展/员工自助入口提示 | `watch(modeStore.currentMode)` 监听进入/退出时发送问候/退出消息 |
