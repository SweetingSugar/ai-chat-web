export const CHAT_TOOL_LIMIT = 20;
export function toggleChatTool(current, toolCode) {
    if (current.includes(toolCode)) {
        return { toolCodes: current.filter((item) => item !== toolCode), error: null };
    }
    if (current.length >= CHAT_TOOL_LIMIT) {
        return { toolCodes: [...current], error: `最多可选择 ${CHAT_TOOL_LIMIT} 个工具` };
    }
    return { toolCodes: [...current, toolCode], error: null };
}
