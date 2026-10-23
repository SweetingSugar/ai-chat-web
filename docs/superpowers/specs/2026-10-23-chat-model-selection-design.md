# 聊天界面模型选择接口接入设计

> 日期：2026-10-23
> 项目：AI Chat Web
> 范围：聊天界面调用 `/api/chat/models`，并持久化当前会话的模型选择

## 1. 目标与范围

后端新增用户可查询模型接口 `GET /api/chat/models`。前端聊天头部的模型选择器需要展示接口返回的全部模型，并将用户选择保存到当前会话，使后续发送、重试、重新生成以及重新进入会话时都使用该模型。

接口返回的 `data` 是模型数组，字段与前端现有 `ModelSummary` 完全一致：

- `id`
- `providerName`
- `modelCode`
- `modelName`
- `contextWindow`
- `maxOutputTokens`
- `supportStream`
- `defaultModel`

本次不引入 Pinia、不改变后端数据结构、不增加新的会话接口。复用已有的 `PUT /api/chat/sessions/{id}` 更新 `defaultModelId`。

## 2. 方案选择

### 方案 A：仅前端切换，不保存

选择模型后只更新本地状态，发送时使用该模型。实现简单，但刷新页面或切换会话后会丢失选择，不满足会话级模型配置需求。

### 方案 B：切换后立即更新当前会话（采用）

页面加载模型列表；用户选择模型后立即调用已有会话更新接口，提交 `{ defaultModelId }`。成功后以服务端返回的会话对象更新本地状态。该方案与现有 `ChatSession.defaultModelId` 和流式请求链路最匹配，状态一致性最好。

### 方案 C：发送时才保存模型

先在前端暂存选择，发送时更新会话并发起流式请求。可减少无效更新，但刷新或发送前切换会丢失选择，还需要处理更新失败后是否继续发送，整体状态更复杂。

## 3. 架构与数据流

沿用现有 `Chat.vue → ChatHeader → useChatWorkspace → chatApi` 结构：

1. `Chat.vue` 在挂载时调用 `chatApi.listModels()`，请求 `GET /api/chat/models`。
2. `Chat.vue` 将模型列表、当前模型 ID 和禁用状态传递给 `ChatHeader`。
3. `ChatHeader` 根据模型列表渲染下拉选项，并在改变时发出目标模型 ID。
4. `Chat.vue` 调用 `workspace.changeModel(modelId)`。
5. `useChatWorkspace.changeModel` 检查当前会话和生成状态，确认允许切换后调用 `api.updateSession(activeSessionId, { defaultModelId: modelId })`。
6. 更新成功后，以接口返回的 `ChatSession` 替换本地对应会话；发送、重试和重新生成继续从 `activeSession.defaultModelId` 构造 `modelId`。
7. 更新失败时不修改本地会话模型，并将错误抛给页面显示。

## 4. 状态与异常处理

### 4.1 模型列表加载

- 模型列表单独维护加载状态和错误状态，不阻止会话列表加载。
- 加载中禁用选择器，避免在选项尚未准备好时操作。
- 模型接口失败时提示“模型列表加载失败”，但保留当前会话的模型降级选项，用户仍可继续使用当前模型。
- 接口返回重复 ID 时前端去重。
- 当前会话模型不在接口列表中时，临时保留一个当前模型降级选项；新选择只能来自接口返回的模型。

### 4.2 模型切换

- 没有活动会话时不执行更新。
- 正在生成时禁用选择器并忽略切换，避免修改正在执行的请求配置。
- 更新接口请求期间禁用选择器，防止重复提交。
- 只允许提交模型列表中的 ID。
- 成功后使用后端返回的会话对象更新本地状态，并显示成功提示。
- 失败时保持原模型选择并显示后端错误信息。
- 切换会话后，以新会话详情中的 `defaultModelId` 为准。

## 5. 修改范围

- `src/api/chat.ts`
  - 将现有 `listModels()` 路径从 `/api/ai/models` 改为 `/api/chat/models`。
- `src/composables/useChatWorkspace.ts`
  - 将 `updateSession` 纳入工作区 API 类型。
  - 新增 `changeModel(modelId)`。
  - 暴露模型切换中的状态，防止重复更新。
- `src/components/chat/ChatHeader.vue`
  - 接收模型列表、当前模型 ID 和禁用状态。
  - 渲染真实模型选项，不再只渲染当前模型的单一选项。
- `src/views/Chat.vue`
  - 加载并维护模型列表及加载状态。
  - 计算当前会话模型并处理切换成功、失败提示。
  - 在模型加载、模型更新和生成期间正确禁用选择器。
- `src/types/chat.ts`
  - 如实现需要，仅补充前端状态类型；保持 `ModelSummary` 与后端字段一致。
- `tests/chatWorkspace.test.mjs`
  - 覆盖模型切换成功、更新参数、切换失败保持原状态和生成中禁止切换。
- API 相关测试
  - 验证模型请求使用 `/api/chat/models`。

## 6. 验收标准

1. 页面进入后请求 `/api/chat/models` 并显示所有返回模型。
2. 当前会话的 `defaultModelId` 对应模型默认选中。
3. 切换模型调用 `PUT /api/chat/sessions/{id}`，请求体为 `{ defaultModelId: 目标模型 ID }`。
4. 切换成功后发送消息，流式请求的 `modelId` 为目标模型 ID。
5. 刷新页面或重新进入会话后，仍显示已保存的模型。
6. 切换失败时恢复原模型并提示错误。
7. 生成中无法切换模型。
8. `npm run type-check`、`npm run build` 和相关自动化测试通过。

## 7. 验证命令

```bash
node --test tests/apiClient.test.mjs tests/chatWorkspace.test.mjs tests/sseParser.test.mjs
npm run type-check
npm run build
```
