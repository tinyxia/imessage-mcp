import { LOG } from "./shared/utils.js";

export function isToolAllowed(toolName, safety) {
  if (safety.readOnly && isWriteTool(toolName)) {
    return false;
  }
  if (safety.allowedTools && !safety.allowedTools.includes(toolName)) {
    return false;
  }
  if (safety.blockedTools && safety.blockedTools.includes(toolName)) {
    return false;
  }
  return true;
}

function isWriteTool(toolName) {
  const writeTools = new Set([
    "run_shell_command",
    "shell",
    "execute_command",
    "write_file",
    "edit_file",
    "delete_file",
  ]);
  return writeTools.has(toolName);
}

export function isCommandBlocked(command, blockedPatterns) {
  if (!command || !blockedPatterns || blockedPatterns.length === 0) return false;
  for (const pattern of blockedPatterns) {
    const regex = new RegExp(pattern, "i");
    if (regex.test(command)) {
      LOG.warn("Blocked command matched", { command, pattern });
      return true;
    }
  }
  return false;
}

export async function requestConfirmation(text, replyFn) {
  try {
    await replyFn(`⚠️ 请求确认：\n${text}\n\n回复 "确认" 以继续执行。`);
    // In a real implementation, this would wait for the user's reply.
    // For now, we return false to be safe; the daemon can implement polling.
    return false;
  } catch (err) {
    LOG.error("Failed to send confirmation request", { error: err.message });
    return false;
  }
}

export function sanitizeForLogging(input) {
  const clone = { ...input };
  if (clone.apiKey) clone.apiKey = "***";
  if (clone.password) clone.password = "***";
  if (clone.token) clone.token = "***";
  return clone;
}
