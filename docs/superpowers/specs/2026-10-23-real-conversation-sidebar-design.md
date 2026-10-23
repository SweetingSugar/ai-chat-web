# 真实接口会话侧栏设计

- 日期：2026-10-23
- 范围：聊天页面左侧会话列表
- 目标：使用后端真实会话接口替换演示数据，并支持分页、会话切换及会话管理操作

## 1. 背景与目标

当前聊天页面通过 `demoChat.ts` 向 `createChatWorkspace` 注入演示会话和演示回复。后端已经提供普通用户会话接口：

- `GET /api/chat/sessions?page=1&size=20`
- `POST /api/chat/sessions`
- `GET /api/chat/sessions/{id}`
- `PUT /api/chat/sessions/{id}`
- `PUT /api/chat/sessions/{id}/pin?pinned=true|false`
- `DELETE /api/chat/sessions/{id}`

本次将侧栏改为真实数据驱动，并支持超过 20 条会话时滚动到底部自动加载下一页。范围包括：首次加载、分页追加、切换、创建、重命名、置顶/取消置顶和删除；不包含新的后端接口和模型选择器改造。

## 2. 方案选择

采用扩展现有 `createChatWorkspace` 的方案，而不是引入 Pinia 或让 `Sidebar` 直接请求接口。

理由：

- 当前工作区已经集中管理会话、当前会话和消息，扩展它能保持状态单一来源。
- `Sidebar` 继续只负责展示、搜索和发出用户操作事件，不耦合 API。
- 不引入当前工程尚未使用的状态管理依赖。
- 为后续真实消息流和会话详情同步保留清晰边界。

## 3. 状态与数据流

### 3.1 初始化

`Chat.vue` 创建工作区后调用 `workspace.loadSessions()`：

```text
Chat.vue
  └─ createChatWorkspace()
       └─ loadSessions()
            └─ GET /api/chat/sessions?page=1&size=20
```

接口 `data.records` 作为服务端会话列表，不生成伪造会话。加载完成后：

- 有会话：激活接口返回的第一条会话，并调用详情接口。
- 无会话：保持无当前会话，显示欢迎空状态。
- 请求失败：保留空列表并显示可理解的错误提示。
- 401：复用现有 `apiRequest` 和认证状态监听，清理登录态并跳转登录页。

### 3.2 分页

工作区保存以下分页状态：

```ts
{
  currentPage: number
  totalPages: number
  isLoadingSessions: boolean
  isLoadingMoreSessions: boolean
  hasMoreSessions: boolean
}
```

首次加载第 1 页，每页 20 条。列表滚动到底部附近时请求下一页并追加记录；请求成功后才递增页码。达到 `pages` 后不再请求。

搜索只对已经加载的会话做前端标题模糊过滤，不改变服务端分页语义，也不在搜索期间自动请求下一页。

### 3.3 会话操作

```text
新建
  POST /api/chat/sessions
  → 将服务端返回会话插入列表头部
  → 激活新会话
  → 清空当前消息

切换
  GET /api/chat/sessions/{id}
  → 用返回的 session 和 messages 更新当前状态

重命名
  PUT /api/chat/sessions/{id}
  → 用服务端返回会话替换本地对象

置顶
  PUT /api/chat/sessions/{id}/pin?pinned=true|false
  → 用服务端返回会话更新对象
  → 按后端返回顺序重新排列，避免前端自行推断排序

删除
  DELETE /api/chat/sessions/{id}
  → 从列表移除
  → 若删除当前会话，激活列表第一条并加载详情
  → 若没有其他会话，进入欢迎空状态
```

所有写操作以接口返回结果为准，不在请求成功前乐观修改列表。

## 4. 组件与模块职责

### 4.1 `src/composables/useChatWorkspace.ts`

新增或扩展：

```ts
loadSessions()
loadMoreSessions()
loadSessionDetail(sessionId)
createSession()
renameSession(sessionId, title)
togglePinned(sessionId)
deleteSession(sessionId)
```

对外暴露加载和错误状态：

```ts
isLoadingSessions
isLoadingMoreSessions
isLoadingSessionDetail
sessionsError
hasMoreSessions
```

工作区负责 API 调用、分页、当前会话、详情竞态控制和本地状态同步。

### 4.2 `src/components/chat/Sidebar.vue`

保留已有搜索、重命名、置顶和删除交互，新增：

- 首次加载状态
- 分页加载状态
- 加载错误和重试入口
- `load-more` 事件
- 会话列表滚动监听
- 距离底部约 48px 时触发下一页
- 加载中禁止重复触发
- 区分“没有会话”和“没有匹配结果”

`Sidebar` 不直接调用 API。

### 4.3 `src/views/Chat.vue`

- 移除 `demoSessions`、`demoMessages`、`demoRespond` 注入。
- 挂载时加载真实会话。
- 将工作区真实状态和操作传给 `Sidebar`。
- 新建、删除、切换后关闭移动端侧栏。
- 使用服务端返回的会话标题和消息。
- 详情加载期间展示明确的加载状态。

### 4.4 `src/api/chat.ts`

当前已经具备本次所需的所有 API 封装，不新增后端接口。现有 `apiRequest` 自动处理动态 Token Header 和普通响应包装。

## 5. 并发与错误处理

### 5.1 并发控制

- 首次列表加载未完成时不重复加载。
- 下一页请求使用 `isLoadingMoreSessions` 防止重复触发。
- 会话切换使用请求序号或等效的最新请求判断；旧详情返回后不得覆盖当前新会话。
- 创建、重命名、置顶和删除请求期间禁用对应操作。
- 用户可以在某个详情请求进行时切换到其他会话。

### 5.2 错误行为

- `401 / UNAUTHENTICATED`：沿用现有认证清理和登录跳转。
- `404 / CHAT_CONVERSATION_NOT_FOUND`：移除失效会话；若为当前会话则切换到下一条。
- `400 / VALIDATION_ERROR`：保留输入并显示后端校验信息。
- 网络错误或 `500`：不改变现有列表，显示“加载失败，请重试”。
- 分页失败：不增加页码，列表底部显示可重试状态。
- 详情失败：保留当前会话标题，消息区显示错误并提供重新加载入口。

## 6. 测试与验收

补充工作区单元测试，覆盖：

1. 初始化加载第一页并激活首个会话。
2. 空列表时无当前会话。
3. 下一页追加记录并在最后一页停止请求。
4. 创建会话并激活服务端返回的会话。
5. 切换会话加载详情和消息。
6. 重命名、置顶使用服务端返回数据更新本地状态。
7. 删除当前会话后切换到下一条。
8. 删除最后一个会话后进入空状态。
9. 快速切换时旧详情不能覆盖新会话。
10. API 失败时本地状态保持不变。

验收标准：

- 登录后左侧栏展示当前用户真实会话。
- 刷新页面后列表和当前会话从后端恢复。
- 超过 20 条时滚动到底部自动加载下一页。
- 新建、切换、重命名、置顶和删除均持久化到后端。
- 错误响应不会造成未捕获异常或虚假会话。
- 不再依赖 `demoChat.ts` 中的演示会话数据。
- `npm run build` 和现有测试通过。

## 7. 明确不在本次范围内

- 新增普通用户模型列表接口。
- 模型选择器真实联动。
- 流式消息接口改造。
- Pinia 引入。
- 后台管理功能。
