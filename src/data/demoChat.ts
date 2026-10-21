import type { ChatMessage, ChatSession } from '../types/chat'

const time = '2026-10-21T10:00:00'

export const demoSessions: ChatSession[] = [
  {
    id: 101,
    title: '欢迎来到 AI Chat',
    defaultModelId: 3,
    pinned: true,
    status: 'ACTIVE',
    lastMessageTime: time,
    createTime: time,
    updateTime: time,
  },
  {
    id: 102,
    title: '产品需求梳理',
    defaultModelId: 3,
    pinned: false,
    status: 'ACTIVE',
    lastMessageTime: '2026-10-20T16:30:00',
    createTime: '2026-10-20T15:20:00',
    updateTime: '2026-10-20T16:30:00',
  },
]

export const demoMessages: Record<number, ChatMessage[]> = {
  101: [
    {
      id: 1001,
      sessionId: 101,
      role: 'ASSISTANT',
      content: '你好，我是你的 AI 助手。可以帮你梳理想法、解释概念、写作和处理代码。今天想从什么开始？',
      sequence: 1,
      status: 'COMPLETED',
      generationTaskId: null,
      requestId: null,
      modelId: 3,
      errorCode: null,
      errorMessage: null,
      createTime: time,
      updateTime: time,
    },
  ],
  102: [
    {
      id: 1002,
      sessionId: 102,
      role: 'USER',
      content: '帮我梳理一下一个 AI 聊天产品的核心页面。',
      sequence: 1,
      status: 'COMPLETED',
      generationTaskId: null,
      requestId: null,
      modelId: null,
      errorCode: null,
      errorMessage: null,
      createTime: '2026-10-20T16:28:00',
      updateTime: '2026-10-20T16:28:00',
    },
    {
      id: 1003,
      sessionId: 102,
      role: 'ASSISTANT',
      content: '可以先拆成三个核心区域：会话导航、消息时间线和输入区。再围绕新建会话、流式生成、停止与重试设计状态反馈。',
      sequence: 2,
      status: 'COMPLETED',
      generationTaskId: null,
      requestId: null,
      modelId: 3,
      errorCode: null,
      errorMessage: null,
      createTime: '2026-10-20T16:30:00',
      updateTime: '2026-10-20T16:30:00',
    },
  ],
}

export function demoRespond(content: string, signal?: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      resolve(`这是一个演示回复。我先根据你的问题整理出重点：\n\n${content}\n\n如果你愿意，我还可以继续把它拆成具体步骤。`)
    }, 520)
    signal?.addEventListener('abort', () => {
      window.clearTimeout(timer)
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    }, { once: true })
  })
}
