import { computed, ref } from 'vue'
import { knowledgeApi } from '../api/knowledge.js'
import type { KnowledgeBase, KnowledgeDocument, KnowledgeDocumentPreview } from '../types/chat.js'

export type KnowledgeBaseWorkspaceApi = Pick<typeof knowledgeApi,
  'list' | 'get' | 'create' | 'update' | 'delete' | 'changeEmbeddingModel' |
  'listDocuments' | 'getDocumentContent' | 'getFilePresignedUrl' |
  'addTextDocument' | 'uploadDocument' | 'deleteDocument' | 'retryDocument'>

export interface KnowledgeBaseWorkspaceOptions {
  api?: KnowledgeBaseWorkspaceApi
  pageSize?: number
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function createKnowledgeBaseWorkspace(options: KnowledgeBaseWorkspaceOptions = {}) {
  const api = options.api ?? knowledgeApi
  const pageSize = options.pageSize ?? 20
  const bases = ref<KnowledgeBase[]>([])
  const selectedBase = ref<KnowledgeBase | null>(null)
  const documents = ref<KnowledgeDocument[]>([])
  const basesError = ref<string | null>(null)
  const detailError = ref<string | null>(null)
  const documentsError = ref<string | null>(null)
  const isLoadingBases = ref(false)
  const isLoadingMoreBases = ref(false)
  const isLoadingDetail = ref(false)
  const isLoadingDocuments = ref(false)
  const isLoadingMoreDocuments = ref(false)
  const isMutating = ref(false)
  const preview = ref<KnowledgeDocumentPreview | null>(null)
  const previewError = ref<string | null>(null)
  const isLoadingPreview = ref(false)
  const previewingDocumentId = ref<number | null>(null)
  let previewRequestVersion = 0
  const basePage = ref(0)
  const basePages = ref(0)
  const documentPage = ref(0)
  const documentPages = ref(0)

  const hasMoreBases = computed(() => basePage.value < basePages.value)
  const hasMoreDocuments = computed(() => documentPage.value < documentPages.value)

  function replaceBase(next: KnowledgeBase) {
    const index = bases.value.findIndex((base) => base.id === next.id)
    if (index >= 0) bases.value[index] = next
    if (selectedBase.value?.id === next.id) selectedBase.value = next
  }

  async function loadBases() {
    if (isLoadingBases.value) return
    isLoadingBases.value = true
    basesError.value = null
    try {
      const result = await api.list(1, pageSize)
      bases.value = result.records
      basePage.value = result.current
      basePages.value = result.pages
      return result
    } catch (error) {
      bases.value = []
      basePage.value = 0
      basePages.value = 0
      basesError.value = errorMessage(error, '加载知识库失败，请重试')
      throw error
    } finally {
      isLoadingBases.value = false
    }
  }

  async function loadMoreBases() {
    if (isLoadingBases.value || isLoadingMoreBases.value || !hasMoreBases.value) return
    isLoadingMoreBases.value = true
    basesError.value = null
    try {
      const result = await api.list(basePage.value + 1, pageSize)
      bases.value.push(...result.records)
      basePage.value = result.current
      basePages.value = result.pages
      return result
    } catch (error) {
      basesError.value = errorMessage(error, '加载更多知识库失败，请重试')
      throw error
    } finally {
      isLoadingMoreBases.value = false
    }
  }

  async function loadDocuments(baseId: number, reset = true) {
    if (isLoadingDocuments.value || isLoadingMoreDocuments.value) return
    const loading = reset ? isLoadingDocuments : isLoadingMoreDocuments
    loading.value = true
    documentsError.value = null
    try {
      const page = reset ? 1 : documentPage.value + 1
      const result = await api.listDocuments(baseId, page, pageSize)
      documents.value = reset ? result.records : [...documents.value, ...result.records]
      documentPage.value = result.current
      documentPages.value = result.pages
      return result
    } catch (error) {
      if (reset) {
        documents.value = []
        documentPage.value = 0
        documentPages.value = 0
      }
      documentsError.value = errorMessage(error, '加载文档失败，请重试')
      throw error
    } finally {
      loading.value = false
    }
  }

  async function openBase(id: number) {
    isLoadingDetail.value = true
    detailError.value = null
    try {
      const base = await api.get(id)
      selectedBase.value = base
      await loadDocuments(id)
      return base
    } catch (error) {
      detailError.value = errorMessage(error, '加载知识库详情失败，请重试')
      throw error
    } finally {
      isLoadingDetail.value = false
    }
  }

  async function runMutation<T>(action: () => Promise<T>) {
    if (isMutating.value) return undefined
    isMutating.value = true
    try {
      return await action()
    } finally {
      isMutating.value = false
    }
  }

  function requireSelectedBase() {
    if (!selectedBase.value) throw new Error('请先选择知识库')
    return selectedBase.value
  }

  async function createBase(payload: { name: string; description?: string; embeddingModelId: number }) {
    return runMutation(async () => {
      const created = await api.create(payload)
      bases.value.unshift(created)
      selectedBase.value = created
      documents.value = []
      documentPage.value = 0
      documentPages.value = 0
      return created
    })
  }

  async function updateBase(payload: { name: string; description?: string }) {
    return runMutation(async () => {
      const base = requireSelectedBase()
      const updated = await api.update(base.id, payload)
      replaceBase(updated)
      return updated
    })
  }

  async function changeEmbeddingModel(embeddingModelId: number) {
    return runMutation(async () => {
      const base = requireSelectedBase()
      const updated = await api.changeEmbeddingModel(base.id, embeddingModelId)
      replaceBase(updated)
      return updated
    })
  }

  async function deleteBase() {
    return runMutation(async () => {
      const base = requireSelectedBase()
      await api.delete(base.id)
      bases.value = bases.value.filter((item) => item.id !== base.id)
      selectedBase.value = null
      documents.value = []
      documentPage.value = 0
      documentPages.value = 0
    })
  }

  async function addTextDocument(payload: { title: string; content: string }) {
    return runMutation(async () => {
      const base = requireSelectedBase()
      const added = await api.addTextDocument(base.id, payload)
      documents.value.unshift(added)
      return added
    })
  }

  async function uploadDocument(file: File, title?: string) {
    return runMutation(async () => {
      const base = requireSelectedBase()
      const added = await api.uploadDocument(base.id, file, title)
      documents.value.unshift(added)
      return added
    })
  }

  async function deleteDocument(documentId: number) {
    return runMutation(async () => {
      const base = requireSelectedBase()
      await api.deleteDocument(base.id, documentId)
      documents.value = documents.value.filter((document) => document.id !== documentId)
    })
  }

  async function retryDocument(documentId: number) {
    return runMutation(async () => {
      const base = requireSelectedBase()
      await api.retryDocument(base.id, documentId)
      await loadDocuments(base.id)
    })
  }

  async function loadDocumentPreview(document: KnowledgeDocument) {
    const base = requireSelectedBase()
    const requestVersion = ++previewRequestVersion
    preview.value = null
    previewError.value = null
    isLoadingPreview.value = true
    previewingDocumentId.value = document.id

    try {
      if (document.sourceType === 'TEXT') {
        const content = await api.getDocumentContent(base.id, document.id)
        if (requestVersion === previewRequestVersion) {
          preview.value = { kind: 'TEXT', documentId: document.id, title: content.title, content: content.content }
        }
        return preview.value
      }

      if (document.sourceType === 'FILE') {
        if (document.fileId === null) throw new Error('文件信息不完整，无法预览')
        const download = await api.getFilePresignedUrl(document.fileId)
        if (requestVersion === previewRequestVersion) {
          preview.value = {
            kind: 'FILE',
            documentId: document.id,
            title: document.title,
            fileId: document.fileId,
            url: download.url,
          }
        }
        return preview.value
      }

      throw new Error('暂不支持预览此文档类型')
    } catch (error) {
      const message = errorMessage(error, '加载文档预览失败，请重试')
      if (requestVersion === previewRequestVersion) previewError.value = message
      throw error
    } finally {
      if (requestVersion === previewRequestVersion) {
        isLoadingPreview.value = false
        previewingDocumentId.value = null
      }
    }
  }

  function resetDocumentPreview() {
    previewRequestVersion += 1
    preview.value = null
    previewError.value = null
    isLoadingPreview.value = false
    previewingDocumentId.value = null
  }

  return {
    bases,
    selectedBase,
    documents,
    basesError,
    detailError,
    documentsError,
    isLoadingBases,
    isLoadingMoreBases,
    isLoadingDetail,
    isLoadingDocuments,
    isLoadingMoreDocuments,
    isMutating,
    preview,
    previewError,
    isLoadingPreview,
    previewingDocumentId,
    hasMoreBases,
    hasMoreDocuments,
    loadBases,
    loadMoreBases,
    loadDocuments,
    openBase,
    createBase,
    updateBase,
    changeEmbeddingModel,
    deleteBase,
    addTextDocument,
    uploadDocument,
    deleteDocument,
    retryDocument,
    loadDocumentPreview,
    resetDocumentPreview,
  }
}
