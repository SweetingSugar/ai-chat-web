# Agent 前端界面设计

## 1. 目标

在现有 Vue 聊天工作区中接入后端已经提供的用户 Agent 能力。用户可以在前端创建、查询、编辑、启停和删除自己的 Agent，并能在聊天时选择一个 Agent 发起对话。

界面沿用现有导航、工作区侧栏、弹窗、卡片、主题变量与移动端适配方式，不引入新的 UI 或状态管理依赖。

## 2. 范围

### 包含

- 新增 Agent 管理页，支持分页列表、创建、编辑、启停和删除；
- 在左侧工作区导航增加 Agent 入口；
- 创建/编辑时配置名称、描述、系统提示词、固定模型、知识库和工具；
- 在聊天输入区选择或取消 Agent；
- 选中 Agent 后锁定手动模型、知识库和工具选择，附件上传仍然可用；
- 普通发送和重新生成显式携带当前会话所选 Agent 的 `agentId`；
- Agent 选择仅在当前页面运行期间按会话保存在内存中；
- 类型检查、生产构建及新增状态逻辑验证。

### 不包含

- 新增或修改后端 API、数据库或 Agent 运行时逻辑；
- 将 Agent 选择持久化到会话、消息或浏览器本地存储；
- Agent 的复制、共享、版本、协作编辑、运行审计或专属会话；
- 改造现有聊天 SSE 协议；
- 引入第三方 UI、状态管理或测试依赖。

## 3. 已确认的产品规则

- 管理页和聊天选择均需实现；
- 用户只能管理后端返回的自己的 Agent；
- 只显示和允许选择启用状态的 Agent；
- 选中 Agent 后，模型、知识库和工具配置由 Agent 固定，客户端不得将同类手动选择随请求发送；
- Agent 模式下附件上传和发送保持可用；
- 每个当前页面会话独立保存选择的 Agent；新建会话默认不选择；刷新页面后不恢复选择；
- 重新生成使用当前页面中该会话当前选择的 Agent，符合后端要求每次重新生成显式传入 `agentId` 的契约；
- 后端因 Agent 被删除、禁用或绑定资源失效而拒绝请求时，前端展示错误，不回退为普通聊天。

## 4. 信息架构

### 4.1 路由与导航

新增受认证保护的路由：

```text
/agents  -> Agents.vue
```

在 `WorkspaceSidebar` 的“对话”和“知识库”之后增加“Agent”导航项。Agent 页与知识库页一样使用工作区侧栏，移动端继续使用打开导航和设置抽屉的既有模式。

### 4.2 Agent 管理页

页面包含：

- 标题“Agent”、简短说明和“新建 Agent”按钮；
- 加载、空态、错误和重新加载状态；
- 分页卡片列表：名称、描述、固定模型、关联知识库/工具数量、状态、更新时间；
- 卡片操作：编辑、启用/停用、删除；
- 新建/编辑共用的表单弹窗；
- 删除二次确认；
- 沿用全局 toast 展示成功和失败反馈。

表单字段如下：

| 字段 | 规则 |
| --- | --- |
| 名称 | 必填，最多 100 个字符 |
| 描述 | 可选，最多 1000 个字符 |
| 系统提示词 | 必填，最多 20,000 个字符 |
| 固定模型 | 必选，来自现有聊天模型列表 |
| 知识库 | 多选，来自当前用户知识库，最多 10 个 |
| 工具 | 多选，来自当前可用工具，最多 20 个 |

客户端在选择时阻止超过知识库或工具上限，但后端验证仍是最终约束。提交失败时保留表单输入和原列表数据。

### 4.3 聊天中的 Agent 选择

在现有 `Composer` 扩展控制区增加 Agent picker：

- 选择器提供“普通对话（不使用 Agent）”与已启用 Agent；
- 选中项显示 Agent 名称、固定模型、已绑定知识库和工具数量；
- 没有可选 Agent 时，展示创建引导并允许跳转到 Agent 管理页；
- 选中 Agent 后显示“正在使用 Agent 配置；模型、知识库和工具由 Agent 固定。”；
- 顶部模型切换、知识库选择和工具选择禁用而不隐藏；
- 选择 Agent 时清空尚未发送的手动知识库与工具选择；
- 生成中禁止切换 Agent 或改动相关配置；
- 附件上传不受影响。

切换 Agent 不修改会话的默认模型。Agent 的模型仅通过单次聊天请求中的 `agentId` 由后端解析。

## 5. 组件与模块边界

### 新增

| 文件 | 职责 |
| --- | --- |
| `src/api/agent.ts` | 调用 Agent REST API。 |
| `src/types/agent.ts` | Agent、请求载荷和聊天选择摘要类型。 |
| `src/composables/useAgentWorkspace.ts` | Agent 列表、分页、写操作及其状态。 |
| `src/views/Agents.vue` | 管理页装配、弹窗、toast、认证和移动端状态。 |
| `src/components/agent/AgentList.vue` | 列表、空态、错误、重试和加载更多。 |
| `src/components/agent/AgentCard.vue` | Agent 摘要展示和操作事件。 |
| `src/components/agent/AgentFormDialog.vue` | 创建/编辑表单及选择上限约束。 |
| `src/components/agent/AgentPicker.vue` | Composer 中的选择/取消和配置摘要。 |

### 修改

| 文件 | 修改 |
| --- | --- |
| `src/router/index.ts` | 注册 `/agents` 认证路由。 |
| `src/components/layout/WorkspaceSidebar.vue` | 增加 Agent 导航入口。 |
| `src/views/Chat.vue` | 加载可选 Agent，连接选择、发送和聊天状态。 |
| `src/components/chat/Composer.vue` | 容纳 Agent picker，锁定知识库和工具选择。 |
| `src/components/chat/ChatHeader.vue` | Agent 模式下禁用模型切换并展示原因。 |
| `src/composables/useChatWorkspace.ts` | 维护每会话 Agent 选择，将可选 `agentId` 注入发送和重新生成请求。 |
| `src/types/chat.ts` | 在聊天和重新生成请求类型中加入可选 `agentId`。 |

## 6. API 与状态流

### 6.1 Agent API

`src/api/agent.ts` 通过现有 `apiRequest` 调用：

```text
GET    /api/agents?page=&size=
GET    /api/agents/{id}
POST   /api/agents
PUT    /api/agents/{id}
DELETE /api/agents/{id}
PATCH  /api/agents/{id}/status
```

请求载荷与后端 `AgentUpsertRequest` 和 `AgentStatusRequest` 对齐。模型、知识库和工具候选数据复用既有 `chatApi.listModels`、`knowledgeApi.list` 和 `chatApi.listAvailableTools`。

### 6.2 管理页状态

`useAgentWorkspace` 负责：

- 首次加载、分页追加、加载状态和错误状态；
- 创建、更新、删除和状态切换；
- 成功后局部更新列表，而非无条件整页重新拉取；
- 对可恢复失败抛出错误，由视图统一 toast 提示。

表单候选资源在打开时加载。候选资源加载失败时应保留重试机会，不允许用缺失候选的状态提交新配置。

### 6.3 聊天状态

`useChatWorkspace` 维护：

```ts
Record<number, AgentSummary | null>
```

- 选择 Agent 时为当前会话写入摘要；取消时删除或置空；
- 新建会话没有默认 Agent；删除会话时清理对应状态；
- 发送时从当前会话取出 `agentId` 并放入 `ChatRequest`；
- 重新生成时同样显式放入 `ChatRegenerateRequest`；
- 未选 Agent 时不得发送 `agentId`，既有普通聊天保持不变；
- 内存状态不写入聊天会话 API 或浏览器存储。

## 7. 异常处理

- 管理 API 失败：保留用户输入和已有列表，展示后端或统一的回退错误文本；
- Agent 选择加载失败：聊天保持可用，选择器显示可重试状态；
- `AGENT_NOT_FOUND`、`AGENT_DISABLED`、`AGENT_MODEL_INVALID`、`AGENT_KNOWLEDGE_BASE_INVALID`、`AGENT_TOOL_INVALID`：沿用现有请求/SSE 失败显示，绝不静默改为普通聊天；
- 后台删除或禁用已选 Agent：下一次请求由后端拒绝，前端提示用户重新选择或前往管理页处理；
- 生成中不允许修改 Agent、模型、知识库或工具选择，避免请求与可见状态不一致。

## 8. 视觉与交互原则

- 复用已有暗/亮主题变量、按钮、卡片、弹窗、状态提示和响应式断点；
- Agent 卡片的内容密度与知识库列表保持一致；
- 状态使用现有启用/停用语义色；
- 选择控件使用现有知识库/工具选择的标签和列表交互，不增加独立设计语言；
- Agent 模式通过禁用态与简短解释表达配置来源，不隐藏仍然存在的功能。

## 9. 验收与验证

验证应覆盖：

1. API 方法、路径和请求载荷与后端契约一致；
2. Agent workspace 的分页、创建、编辑、删除、启停和失败状态；
3. 表单字段校验与知识库 10 个、工具 20 个的选择上限；
4. 选择/取消 Agent 后，普通发送与重新生成正确携带或不携带 `agentId`；
5. Agent 模式下模型、知识库和工具被锁定，附件仍可发送；
6. 每会话选择隔离、新会话默认为普通聊天、删除会话清理内存选择、刷新不恢复；
7. 既有普通聊天、模型切换、知识库选择和工具选择不回归；
8. `npm run type-check` 和 `npm run build` 通过。
