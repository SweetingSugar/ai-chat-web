import { apiRequest, apiStream } from './client.js';
import { SseParser } from '../lib/sseParser.js';
export const chatApi = {
    listSessions(page = 1, size = 20) {
        return apiRequest(`/api/chat/sessions?page=${page}&size=${size}`);
    },
    createSession(title, defaultModelId) {
        return apiRequest('/api/chat/sessions', {
            method: 'POST',
            body: JSON.stringify({ title, defaultModelId }),
        });
    },
    getSession(id) {
        return apiRequest(`/api/chat/sessions/${id}`);
    },
    updateSession(id, payload) {
        return apiRequest(`/api/chat/sessions/${id}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
    },
    pinSession(id, pinned) {
        return apiRequest(`/api/chat/sessions/${id}/pin?pinned=${pinned}`, { method: 'PUT' });
    },
    deleteSession(id) {
        return apiRequest(`/api/chat/sessions/${id}`, { method: 'DELETE' });
    },
    listMessages(id, page = 1, size = 20) {
        return apiRequest(`/api/chat/sessions/${id}/messages?page=${page}&size=${size}`);
    },
    stream(id, payload, signal) {
        return apiStream(`/api/chat/sessions/${id}/stream`, payload, signal);
    },
    regenerate(id, payload, signal) {
        return apiStream(`/api/chat/sessions/${id}/regenerate`, payload, signal);
    },
    readStream: readChatStream,
    listModels() {
        return apiRequest('/api/chat/models');
    },
    uploadFile(file) {
        const body = new FormData();
        body.append('file', file);
        return apiRequest('/api/files', {
            method: 'POST',
            body,
        });
    },
};
export async function readChatStream(response, onEvent) {
    const reader = response.body?.getReader();
    if (!reader)
        throw new Error('当前浏览器不支持流式响应');
    const decoder = new TextDecoder();
    const parser = new SseParser();
    const deliver = (events) => {
        for (const event of events) {
            if (!event.data)
                continue;
            let parsed;
            try {
                parsed = JSON.parse(event.data);
            }
            catch {
                throw new Error('无法解析流式事件');
            }
            if (!parsed || typeof parsed !== 'object' || typeof parsed.type !== 'string') {
                throw new Error('无法解析流式事件');
            }
            onEvent(parsed);
        }
    };
    while (true) {
        const { done, value } = await reader.read();
        deliver(parser.push(decoder.decode(value ?? new Uint8Array(), { stream: !done })));
        if (done)
            break;
    }
    deliver(parser.finish());
}
