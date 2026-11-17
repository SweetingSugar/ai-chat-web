import { apiRequest } from './client.js';
export const knowledgeApi = {
    list(page = 1, size = 20) {
        return apiRequest(`/api/knowledge-bases?page=${page}&size=${size}`);
    },
    get(id) {
        return apiRequest(`/api/knowledge-bases/${id}`);
    },
    create(payload) {
        return apiRequest('/api/knowledge-bases', {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    },
    update(id, payload) {
        return apiRequest(`/api/knowledge-bases/${id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
    },
    delete(id) {
        return apiRequest(`/api/knowledge-bases/${id}`, { method: 'DELETE' });
    },
    changeEmbeddingModel(id, embeddingModelId) {
        return apiRequest(`/api/knowledge-bases/${id}/embedding-model`, {
            method: 'PUT',
            body: JSON.stringify({ embeddingModelId }),
        });
    },
    listDocuments(id, page = 1, size = 20) {
        return apiRequest(`/api/knowledge-bases/${id}/documents?page=${page}&size=${size}`);
    },
    getDocumentContent(baseId, documentId) {
        return apiRequest(`/api/knowledge-bases/${baseId}/documents/${documentId}/content`);
    },
    getFilePresignedUrl(fileId) {
        return apiRequest(`/api/files/${fileId}/presigned-url`);
    },
    addTextDocument(id, payload) {
        return apiRequest(`/api/knowledge-bases/${id}/documents/text`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
    },
    uploadDocument(id, file, title) {
        const body = new FormData();
        body.append('file', file);
        if (title?.trim())
            body.append('title', title.trim());
        return apiRequest(`/api/knowledge-bases/${id}/documents/file`, {
            method: 'POST',
            body,
        });
    },
    deleteDocument(baseId, documentId) {
        return apiRequest(`/api/knowledge-bases/${baseId}/documents/${documentId}`, {
            method: 'DELETE',
        });
    },
    retryDocument(baseId, documentId) {
        return apiRequest(`/api/knowledge-bases/${baseId}/documents/${documentId}/retry`, {
            method: 'POST',
        });
    },
    listEmbeddingModels() {
        return apiRequest('/api/chat/models/embedding');
    },
};
