import { sendMessage } from "../shared/imessage.js";
import { LOG, sleep, splitLongReply } from "../shared/utils.js";
import { isToolAllowed, isCommandBlocked } from "../safety.js";
import { createProvider } from "../providers/index.js";

export class LlmLoop {
  constructor(config, mcpManager) {
    this.config = config;
    this.mcpManager = mcpManager;
    this.provider = createProvider(config);
  }

  async process(userText, state, chatId, replyFn) {
    const chatHistory = state.conversations[chatId] || [];
    const apiMessages = [
      ...chatHistory.slice(-(this.config.maxHistoryPerConversation || 20) * 2),
      { role: "user", content: userText },
    ];

    const allMcpTools = this.mcpManager.getAllTools();
    const localTools = this.getLocalTools();
    const availableTools = [...allMcpTools, ...localTools]
      .filter((t) => isToolAllowed(t.name, this.config.safety))
      .map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      }));

    let currentMessages = [...apiMessages];
    let maxIterations = this.config.maxToolIterations || 10;
    let finalText = "";
    let usedLongReply = false;

    try {
      while (maxIterations-- > 0) {
        LOG.debug("Calling LLM", {
          messagesCount: currentMessages.length,
          toolsCount: availableTools.length,
          iterationsLeft: maxIterations,
        });

        const result = await this.provider.chat(currentMessages, availableTools);

        const assistantContent = [];
        for (const block of this.normalizeResultBlocks(result)) {
          if (block.type === "text") {
            finalText = block.text;
            assistantContent.push(block);
          } else if (block.type === "thinking") {
            assistantContent.push(block);
          } else if (block.type === "tool_use") {
            assistantContent.push(block);
          }
        }

        if (assistantContent.length > 0) {
          currentMessages.push({ role: "assistant", content: assistantContent });
        }

        if (result.toolCalls.length === 0) break;

        for (const toolCall of result.toolCalls) {
          const toolResult = await this.executeTool(toolCall, replyFn);

          currentMessages.push({
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: toolCall.id,
                content:
                  typeof toolResult === "string"
                    ? toolResult
                    : JSON.stringify(toolResult),
              },
            ],
          });

          if (toolCall.name === "send_long_reply") {
            usedLongReply = true;
          }
        }
      }
    } catch (err) {
      LOG.error("LLM error", { error: err.message, status: err.status });
      const errorMsg =
        err.status === 401
          ? "❌ API 认证失败，请检查 API Key 配置"
          : err.status === 429
          ? "❌ API 速率限制，请稍后再试"
          : `❌ 处理出错: ${err.message}`;
      await replyFn(errorMsg);
      return;
    }

    // Send final response
    if (finalText && !usedLongReply) {
      await this.sendReply(finalText, replyFn);
    }

    // Update conversation history
    state.conversations[chatId] = [
      ...(state.conversations[chatId] || []).slice(
        -(this.config.maxHistoryPerConversation || 20) * 2
      ),
      { role: "user", content: userText },
    ];
    if (finalText) {
      state.conversations[chatId].push({
        role: "assistant",
        content: finalText,
      });
    }
  }

  normalizeResultBlocks(result) {
    const blocks = [];
    if (result.text) {
      blocks.push({ type: "text", text: result.text });
    }
    for (const t of result.thinking || []) {
      blocks.push({
        type: "thinking",
        thinking: t.thinking || "",
        signature: t.signature,
      });
    }
    for (const tc of result.toolCalls || []) {
      blocks.push({
        type: "tool_use",
        id: tc.id,
        name: tc.name,
        input: tc.input || {},
      });
    }
    return blocks;
  }

  getLocalTools() {
    return [
      {
        name: "send_imessage",
        description:
          "Send an iMessage to a specified recipient. Use only when explicitly asked.",
        inputSchema: {
          type: "object",
          properties: {
            recipient: {
              type: "string",
              description: "Email or phone number of the recipient",
            },
            text: { type: "string", description: "Message text to send" },
          },
          required: ["recipient", "text"],
        },
        local: true,
      },
      {
        name: "send_long_reply",
        description:
          "Send a long reply that exceeds a single iMessage by splitting it into multiple messages. Call this instead of producing text when the response is long.",
        inputSchema: {
          type: "object",
          properties: {
            parts: {
              type: "array",
              items: { type: "string" },
              description: "Array of message parts, each ≤ 1000 characters",
            },
          },
          required: ["parts"],
        },
        local: true,
      },
    ];
  }

  async executeTool(toolCall, replyFn) {
    LOG.info(`Tool call`, { name: toolCall.name, input: toolCall.input });

    if (!isToolAllowed(toolCall.name, this.config.safety)) {
      return `工具 ${toolCall.name} 被安全策略禁止`;
    }

    const command = toolCall.input?.command || toolCall.input?.cmd || toolCall.input?.shell;
    if (typeof command === "string" && isCommandBlocked(command, this.config.safety.blockedCommands)) {
      return `命令被安全策略禁止: ${command}`;
    }

    try {
      switch (toolCall.name) {
        case "send_imessage": {
          const { recipient, text } = toolCall.input || {};
          if (!recipient || !text) return "缺少 recipient 或 text";
          sendMessage(recipient, text);
          return `已发送消息给 ${recipient}`;
        }

        case "send_long_reply": {
          const parts = toolCall.input?.parts || [];
          for (const part of parts) {
            await replyFn(part);
            if (parts.length > 1) await sleep(1000);
          }
          return `已发送 ${parts.length} 条消息`;
        }

        default:
          return await this.mcpManager.callTool(toolCall.name, toolCall.input);
      }
    } catch (err) {
      LOG.error(`Tool execution failed`, {
        name: toolCall.name,
        error: err.message,
      });
      return `工具执行出错: ${err.message}`;
    }
  }

  async sendReply(text, replyFn) {
    if (text.length > 300) {
      const parts = splitLongReply(text, 300);
      for (const part of parts) {
        await replyFn(part);
        if (parts.length > 1) await sleep(500);
      }
    } else {
      await replyFn(text);
    }
  }
}
