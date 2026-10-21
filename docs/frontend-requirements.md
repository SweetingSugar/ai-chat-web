# AI Chat Web 聊天界面需求与开发设计文档

> 版本：1.1 · 日期：2026-10-21  
> 范围：普通用户聊天端，不包含后台管理功能。  
> 依据：`/Users/ice/dev/project/AI-Chat` 后端源码、后端接口文档以及当前 Vue 3 + Vite 前端工程。

## 1. 产品目标

构建一个类似 ChatGPT 的 AI 对话网页，重点提供自然、连续、稳定的聊天体验：用户登录后可以创建多个会话，发送问题，实时查看 AI 增量回复，停止或重试生成，并在不同设备尺寸下正常使用。

视觉上参考 ChatGPT 的产品形态，但使用独立的品牌色、图标和文案，不直接复制其商标或界面资源。

### 1.1 本期成功标准

- 用户登录后能快速理解如何开始对话。
- 能完成“新建会话 → 发送问题 → 流式查看回答 → 继续追问”的完整流程。
- 刷新页面后会话和消息仍以服务端数据为准。
- 生成中、停止、失败、重试和网络中断都有明确状态。
- 桌面端、平板端和移动端均可完成核心聊天操作。

## 2. 后端能力与联调结论

后端当前已经支持：

| 能力 | 接口/状态 | 前端用途 |
| --- | --- | --- |
| 认证 | 注册、登录、登出、当前用户、修改密码 | 登录页、登录态恢复、用户菜单 |
| 会话 | 创建、分页查询、详情、更新、置顶、删除 | 左侧会话列表 |
| 消息 | 会话详情、消息分页、消息状态 | 消息时间线和历史同步 |
| 流式聊天 | POST + SSE：`start/delta/complete/failed` | 增量渲染 AI 回复 |
| 重新生成 | POST + SSE | 重新生成助手消息 |
| 模型解析 | 会话默认模型、系统默认模型、单次指定模型 | 模型选择器和请求参数 |

### 2.1 后端待补接口

后端内部已有 `AiModelService.listAvailableModels()`，但当前没有普通用户可调用的模型列表 Controller。管理员接口 `/api/admin/ai/models` 受权限保护，不能给普通聊天用户使用。

建议新增：

```http
GET /api/ai/models
```

返回已启用且供应商可用的模型：

```json
[
  {
    "id": 3,
    "providerName": "DeepSeek",
    "modelCode": "deepseek-chat",
    "modelName": "DeepSeek Chat",
    "contextWindow": 32768,
    "maxOutputTokens": 4096,
    "supportStream": true,
    "defaultModel": true
  }
]
```

如果暂时不补充该接口，P0 可以隐藏模型选择器，只使用后端自动解析的会话默认模型或系统默认模型。

## 3. 页面和路由

```text
/login                    登录
/register                 注册
/chat                     聊天首页，进入最近会话或空状态
/chat/:sessionId          指定会话
/settings/profile         个人资料与修改密码
```

本期不实现后台路由、管理菜单、数据看板、用户管理、角色权限管理、供应商管理和模型管理页面。

## 4. 页面布局设计

### 4.1 桌面端

```text
┌───────────────┬──────────────────────────────────────────────┐
│ 品牌标识       │  会话标题                    模型  设置  用户  │
│ ＋ 新建对话    ├──────────────────────────────────────────────┤
│ 搜索会话       │                                              │
│ 置顶会话       │              消息时间线                       │
│ 最近会话       │                                              │
│               │                                              │
│               ├──────────────────────────────────────────────┤
│ 用户菜单       │           多行输入框              发送          │
└───────────────┴──────────────────────────────────────────────┘
```

- 左侧导航建议宽度 `272px`，支持折叠。
- 顶部工具栏高度建议 `56px`。
- 消息内容最大宽度建议 `720px–800px`，保证长文本阅读体验。
- 消息区独立滚动，底部输入区固定且不遮挡最后一条消息。
- 用户消息使用轻量气泡；助手消息使用低对比背景或无气泡布局。

### 4.2 移动端

- 左侧导航默认隐藏，通过顶部菜单按钮以抽屉打开。
- 顶部只保留菜单、会话标题和更多操作。
- 输入区适配 `env(safe-area-inset-bottom)`。
- 消息左右内边距建议 `16px`。
- 会话重命名、置顶、删除放入会话项更多菜单。
- 生成中、复制、重新生成等桌面悬浮操作必须有移动端可见入口。

### 4.3 视觉规范

- 浅色主题：页面背景 `#f7f7f8`，内容层 `#ffffff`，主文字 `#1f2329`。
- 深色主题：页面背景 `#1b1d21`，内容层 `#24272d`，辅助层 `#30343b`。
- 主色使用沉稳的蓝紫色，成功使用绿色，失败使用红色，警告使用琥珀色。
- 圆角建议 `10px–14px`，阴影弱化，避免页面显得像传统后台系统。
- 所有按钮具备 hover、active、focus、disabled 状态。

## 5. 页面功能需求

### 5.1 登录与注册

- 登录字段：用户名、密码。
- 注册字段：用户名、密码、昵称、邮箱、手机号。
- 登录成功后保存响应中的 `data.tokenName` 和 `data.tokenValue`。
- 后续请求使用动态 Header 名称，例如 `satoken: <token>`，不可固定写死 Header 名称。
- 刷新页面时调用 `GET /api/auth/me` 恢复用户信息。
- 401 时清理本地登录态，跳转登录页，并保留原目标路由。
- 注册和登录表单需在前端进行基本校验，并显示后端错误信息。

### 5.2 欢迎空状态

当前会话没有消息时展示：

- 产品标识和简短欢迎语。
- AI 能力说明，例如写作、解释、总结、代码辅助。
- 3–4 个建议问题卡片。
- 点击建议问题只填入输入框，不自动发送。

建议文案：

- “帮我制定一个学习计划”
- “把这段文字改得更清晰”
- “解释一个我不懂的概念”
- “帮我写一个周末旅行计划”

### 5.3 会话导航

- 点击“新建对话”调用 `POST /api/chat/sessions`，成功后进入新会话。
- 默认标题使用后端返回的“新会话”。
- 第一次发送后可将用户首句截取前 20 个字符，通过更新接口设置标题。
- 会话列表调用：

```http
GET /api/chat/sessions?page=1&size=20
```

- 后端已按置顶和最近消息排序，前端按返回顺序展示。
- 支持按标题进行前端模糊搜索，搜索不改变当前会话。
- 会话项支持重命名、置顶、删除。
- 删除前必须二次确认；删除当前会话后进入最近会话，没有其他会话则进入欢迎空状态。
- 当前会话需要有明显选中态；生成中的会话显示轻量状态标记。

会话操作接口：

```text
PUT    /api/chat/sessions/{id}             重命名或修改默认模型
PUT    /api/chat/sessions/{id}/pin?pinned=true
DELETE /api/chat/sessions/{id}
```

### 5.4 消息时间线

- 打开会话调用 `GET /api/chat/sessions/{id}`，获得会话信息和完整消息列表。
- 用户消息右对齐，助手消息左对齐。
- 消息过长时自然换行，不撑破页面。
- 助手消息底部展示复制、重新生成等操作。
- 复制成功显示 Toast；复制失败显示可理解的错误提示。
- 用户滚动到历史位置时，不强制自动滚回底部。
- 新消息生成时，如果用户在底部则自动跟随；如果用户离开底部，显示“回到底部”按钮。
- P0 不接点赞/点踩，因为当前后端没有对应接口；可以预留视觉位置。

### 5.5 输入区

- 多行输入框，最小高度建议 `52px`，最大高度建议 `180px`。
- 默认 Enter 发送，Shift+Enter 换行。
- 输入为空或只有空格时，发送按钮禁用。
- 生成中发送按钮切换为“停止生成”。
- 请求发送前生成客户端 `requestId`，用于关联 SSE 事件。
- 发送后保留本次输入快照，便于失败重试。
- 输入区显示提示：“AI 可能会出错，请核对重要信息”。

### 5.6 模型选择

- 顶部显示当前模型名称和下拉箭头。
- 下拉项展示模型名称、模型代码和能力/速度标签。
- 只展示后端返回的启用模型。
- 选择模型后调用 `PUT /api/chat/sessions/{id}` 更新 `defaultModelId`。
- P0 只开放模型选择；`temperature`、`topP`、`maxOutputTokens` 参数面板放到 P1。

## 6. SSE 流式聊天设计

### 6.1 发起对话

```http
POST /api/chat/sessions/{sessionId}/stream
Content-Type: application/json
<动态 token header>: <tokenValue>
```

请求体：

```json
{
  "content": "请解释这段代码",
  "modelId": 3,
  "requestId": "client-generated-request-id",
  "temperature": 0.7,
  "topP": 0.9,
  "maxOutputTokens": 2048
}
```

前端不能使用原生 `EventSource`，因为后端接口是 POST，并且需要自定义认证 Header。应使用 `fetch` + `ReadableStream`。

### 6.2 客户端状态流转

```text
IDLE
  └─ submit ─> SUBMITTING
                 └─ start ─> STREAMING
                              ├─ delta ─> STREAMING
                              ├─ complete ─> COMPLETED
                              ├─ failed ─> FAILED
                              └─ abort/network error ─> SYNCING
                                                └─ refresh detail ─> IDLE
```

### 6.3 事件处理

1. 提交前将用户消息加入本地列表，创建助手消息占位。
2. `start`：记录 `taskId`、`assistantMessageId`、模型信息。
3. `delta`：将 `data.delta` 追加到助手消息内容。
4. `complete`：更新消息为 `COMPLETED`，记录 Token 用量。
5. `failed`：更新消息为 `FAILED`，展示错误提示和重试按钮。
6. 用户点击停止时调用 `AbortController.abort()`。
7. 停止、网络断开或 SSE 解析异常后，调用会话详情接口，以服务端最终状态为准。

SSE 解析器必须支持：

- 一个事件跨多个网络 chunk。
- 多个事件合并在一个 chunk。
- 空行分隔的 SSE 事件。
- 空 data、半截 JSON 和无效 JSON。
- 事件已完成但连接未立即关闭。

### 6.4 重新生成

```http
POST /api/chat/sessions/{sessionId}/regenerate
```

请求体必须携带当前会话中的助手消息 `messageId`。后端会定位该助手消息之前的用户消息，前端不需要重新提交完整上下文。

重新生成期间：

- 禁用同一会话的发送和再次重新生成。
- 保留原助手消息内容，或使用“重新生成中”状态替换显示。
- 完成后重新拉取会话详情，避免本地消息重复。

## 7. 前端数据模型

```ts
type ChatSessionStatus = 'ACTIVE' | 'ARCHIVED'
type ChatMessageRole = 'USER' | 'ASSISTANT'
type ChatMessageStatus = 'PENDING' | 'STREAMING' | 'COMPLETED' | 'FAILED' | 'INTERRUPTED'
type ChatStreamEventType = 'START' | 'DELTA' | 'COMPLETE' | 'FAILED' | 'INTERRUPTED'

interface ChatSession {
  id: number
  title: string
  defaultModelId: number
  pinned: boolean
  status: ChatSessionStatus
  lastMessageTime: string | null
  createTime: string
  updateTime: string
}

interface ChatMessage {
  id: number
  sessionId: number
  role: ChatMessageRole
  content: string
  sequence: number
  status: ChatMessageStatus
  generationTaskId: number | null
  requestId: string | null
  modelId: number | null
  errorCode: string | null
  errorMessage: string | null
  createTime: string
  updateTime: string
}

interface ChatStreamEvent {
  type: ChatStreamEventType
  taskId: number | null
  requestId: string
  delta: string | null
  assistantMessageId: number | null
  modelId: number | null
  modelCode: string | null
  usage: { inputTokens: number; outputTokens: number; totalTokens: number; source: string } | null
  errorCode: string | null
  message: string | null
}
```

## 8. 前端工程设计

当前工程为 Vue 3 + TypeScript + Vite 起始模板，建议增加 Vue Router 和 Pinia。

### 8.1 组件拆分

```text
AppShell
├── Sidebar
│   ├── BrandMark
│   ├── NewChatButton
│   ├── ConversationSearch
│   ├── ConversationList
│   │   └── ConversationItem
│   └── UserMenu
├── ChatHeader
│   ├── MobileMenuButton
│   ├── SessionTitle
│   ├── ModelSelector
│   └── SettingsButton
├── ChatPanel
│   ├── EmptyState
│   ├── MessageList
│   │   └── MessageItem
│   │       └── MessageActions
│   ├── GenerationStatus
│   ├── ScrollToBottomButton
│   └── Composer
├── SettingsDrawer
├── ConfirmDialog
└── ToastViewport
```

组件职责：

- `Sidebar`：会话导航和用户菜单，不直接处理 AI 生成。
- `MessageList`：消息展示、滚动和消息操作事件。
- `Composer`：输入、提交和停止事件。
- `useChatStream`：SSE 解析、AbortController 和增量消息合并。
- `useAutoScroll`：自动跟随和“回到底部”逻辑。
- Pinia Store：集中管理认证、会话、消息和主题状态。

### 8.2 推荐目录

```text
src/
├── api/              client.ts auth.ts chat.ts
├── components/       chat/ layout/ common/
├── composables/      useChatStream.ts useAutoScroll.ts
├── router/
├── stores/            auth.ts chat.ts settings.ts
├── types/
├── views/             Login.vue Register.vue Chat.vue Profile.vue
└── styles/            tokens.css themes.css
```

## 9. 错误与边界处理

普通接口统一使用：

```json
{
  "success": true,
  "code": "SUCCESS",
  "message": "OK",
  "data": {}
}
```

前端以 `code` 作为稳定分支，以 `message` 作为兜底文案。

| code | 前端行为 |
| --- | --- |
| `UNAUTHENTICATED` | 清理 Token，跳转登录页 |
| `INVALID_CREDENTIALS` | 登录页提示用户名或密码错误 |
| `RESOURCE_NOT_FOUND` | 刷新数据或提示资源不存在 |
| `CHAT_CONVERSATION_NOT_FOUND` | 移除当前会话并回到空状态 |
| `RESOURCE_CONFLICT` | 展示冲突原因，保留表单输入 |
| `AI_PROVIDER_ERROR` | 助手消息失败，显示重试 |
| `VALIDATION_ERROR` | 优先显示字段级校验错误 |
| `CHAT_GENERATION_IN_PROGRESS` | 保持生成状态，禁止重复发送 |

必须覆盖：

- 同一会话连续快速点击发送。
- Token 过期时正在进行 SSE 请求。
- 网络断开但服务端已经完成生成。
- SSE data 跨 chunk、半截 JSON 和重复事件。
- 模型被禁用后发送失败。
- 删除最后一个会话后的空状态。
- 刷新页面时会话列表和详情请求竞态。

## 10. 主题、可访问性与响应式验收

- 支持跟随系统、浅色、深色三种主题，并保存到 `localStorage`。
- 键盘可以完成登录、发送、关闭弹窗、重命名和停止生成。
- 图标按钮必须有 `aria-label` 或可访问名称。
- 输入框、发送按钮、停止按钮具备清晰的 focus 和 disabled 状态。
- 桌面端无整体横向滚动条。
- 移动端输入区不被浏览器底部安全区域遮挡。
- 异步操作始终有 loading、成功、失败或禁用反馈。

## 11. 开发顺序

1. 清理默认 Vue 欢迎页，建立路由、主题变量和基础布局。
2. 实现登录、注册、Token 持久化和路由守卫。
3. 实现左侧会话列表、新建、切换、重命名、置顶和删除。
4. 实现会话详情、空状态、消息时间线和输入区。
5. 实现 SSE `start/delta/complete/failed` 解析与增量渲染。
6. 实现停止生成、失败重试、重新生成和消息同步。
7. 接入模型列表和会话默认模型更新；若后端接口未补充，则先隐藏模型选择器。
8. 实现主题切换、移动端抽屉和响应式适配。
9. 使用真实后端完成鉴权、网络异常、供应商错误和生产构建验证。

## 12. 后续扩展，不属于本期

- 后台管理：用户、角色、权限、供应商、模型和统计。
- Markdown、代码高亮、LaTeX 安全渲染。
- 文件上传、图片输入、语音输入和朗读。
- 引用来源、联网搜索、会话分享和导出。
- 点赞/点踩反馈接口。
- 团队空间、配额和计费。

