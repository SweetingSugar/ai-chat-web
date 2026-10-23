# 实时流式 AI 问答接入设计

> 日期：2026-10-23
> 项目：AI Chat Web
> 范围：聊天界面调用真实后端接口并流式渲染 AI 回复

## 1. 目标与范围

将当前聊天工作区中的本地模拟回复替换为后端真实 SSE 流式问答，完成“发送问题 → 增量显示回答 → 完成/失败/停止 → 以服务端状态同步”的完整链路。采用现有 Vue 3 + TypeScript 组件结构和方案 B 的宽屏聊天工作区。

本次不改动后端，不新增模型列表接口，不引入 Pinia，也不实现 Markdown、文件上传或反馈接口。

## 2. 已确认的后端契约

- 普通接口基地址由 `VITE_API_BASE_URL` 配置，默认开发环境使用 `http://localhost:8080`。
- 认证请求使用登录响应中的动态 `tokenName` 和 `tokenValue`。
- 创建会话：`POST /api/chat/sessions`。
- 会话详情：`GET /api/chat/sessions/{sessionId}`，返回 `session` 与完整 `messages`。
- 发起流式问答：`POST /api/chat/sessions/{sessionId}/stream`，响应为 `text/event-stream`。
- 重新生成：`POST /api/chat/sessions/{sessionId}/regenerate`，请求体需要助手消息 `messageId`。
- SSE 事件为 `START`、`DELTA`、`COMPLETE`、`FAILED`，事件数据包含 `requestId`、`assistantMessageId`、错误信息和可选用量。

## 3. 架构与数据流

沿用现有 `Chat.vue → Composer → useChatWorkspace → chatApi` 结构。`useChatWorkspace` 负责工作区状态，`chatApi` 负责 HTTP/SSE 请求，`SseParser` 负责协议分帧。

发送流程：

1. `Composer` 提交非空文本。
2. 工作区没有当前会话时先创建会话；有会话时复用当前会话。
3. 本地追加用户消息和空的助手消息占位，立即显示用户输入。
4. 生成 `crypto.randomUUID()` 作为 `requestId`，创建 `AbortController`。
5. 调用 `chatApi.stream()`，通过 `readChatStream()` 消费 `ReadableStream`。
6. `START` 记录任务 ID、服务端助手消息 ID 和模型 ID。
7. 每个 `DELTA` 追加到助手消息内容，立即触发 Vue 渲染。
8. `COMPLETE` 标记完成并记录可用的用量信息。
9. `FAILED` 标记失败并展示后端错误。
10. 流正常结束、失败、停止或解析/网络异常后，重新请求会话详情，以服务端持久化状态为最终依据。

重新生成流程使用当前助手消息 ID 调用 `/regenerate`，不重复提交完整上下文；完成后同样同步会话详情。

## 4. 状态与错误处理

### 4.1 生成状态

- 当前会话生成时，`isGenerating` 为真，发送按钮变为停止按钮。
- 助手尚无内容时显示“正在思考”；收到增量后显示文本和流式光标。
- 同一会话生成期间禁止重复发送、重试和重新生成。
- 切换会话不会错误地把生成状态显示到其他会话；后台请求结束后只更新对应会话数据。

### 4.2 完成与失败

- 完成后显示复制和重新生成操作。
- `FAILED` 优先显示 SSE 的 `message`，其次使用通用错误文案，并保留重试入口。
- HTTP 错误沿用现有客户端错误处理；401 清理认证信息并返回登录页。
- 会话不存在或服务端状态变化时，刷新数据并给出可理解的提示。

### 4.3 停止与网络异常

- 点击停止调用 `AbortController.abort()`。
- Abort、网络断开或 SSE JSON 解析异常后先同步会话详情，不擅自覆盖服务端最终状态。
- 若同步失败，保留已接收内容并展示同步/生成失败提示，允许用户重试。

### 4.4 滚动

消息列表在用户位于底部时跟随增量内容；用户阅读历史消息时不强制滚动，并显示“回到底部”操作。

## 5. 修改范围

- `src/composables/useChatWorkspace.ts`：移除默认模拟回复，增加真实流式请求、事件处理、请求 ID、取消和服务端同步；接入真实重试/重新生成。
- `src/api/chat.ts`：完善 SSE 读取期间的错误处理，保持现有 stream/regenerate API。
- `src/types/chat.ts`：按后端事件和用量字段补齐类型（如现有类型不足）。
- `src/views/Chat.vue`：处理空会话发送、真实会话模型信息和生成错误提示，去除模拟模型行为。
- `src/components/chat/MessageList.vue`：确保流式、失败和中断状态在宽屏工作区中清晰呈现。
- 测试：扩展 SSE parser 和 workspace 测试，使用模拟 `Response` 和事件流，不依赖外部网络。

不修改后端，不增加普通用户模型列表接口，不引入额外状态管理库。

## 6. 验收与验证

必须验证：

1. 已登录用户在已有会话中发送问题。
2. 空会话首次发送并自动创建会话。
3. 多个增量事件按顺序实时显示。
4. 完成后消息 ID、状态、标题和时间与服务端一致。
5. 停止后状态以服务端详情为准。
6. 失败事件显示后端错误并可重新生成。
7. HTTP 错误、401 和网络异常处理。
8. SSE 跨 chunk、多个事件合并、空 data 和半截 JSON。
9. 生成过程中切换会话不串消息。
10. `npm run type-check` 和 `npm run build` 通过。

实现完成后使用已启动的后端进行一次真实登录态下的发送验证；若后端 AI 供应商调用失败，需区分前端链路问题与供应商配置问题并如实报告。
