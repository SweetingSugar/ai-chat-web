export const ATTACHMENT_LIMIT = 10;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const DEFAULT_ATTACHMENT_PROMPT = '请分析这些附件。';
const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'application/pdf']);
export function selectChatAttachments(current, candidates) {
    const files = [...current];
    const errors = [];
    let exceededLimit = false;
    for (const file of candidates) {
        if (!SUPPORTED_TYPES.has(file.type)) {
            errors.push('仅支持 JPEG、PNG、GIF 和 PDF 文件');
            continue;
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
            errors.push(`“${file.name}” 超过 10 MB 大小限制`);
            continue;
        }
        if (files.length >= ATTACHMENT_LIMIT) {
            exceededLimit = true;
            continue;
        }
        files.push(file);
    }
    if (exceededLimit)
        errors.push(`最多可添加 ${ATTACHMENT_LIMIT} 个附件`);
    return { files, errors };
}
export function attachmentPrompt(content, files) {
    const trimmed = content.trim();
    return trimmed || (files.length ? DEFAULT_ATTACHMENT_PROMPT : '');
}
export function formatFileSize(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1).replace(/\.0$/, '')} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
}
