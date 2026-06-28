import OpenAI from "openai";
import { BaseProvider, mcpToOpenAITools, openAIToolCallToMcp } from "./base.js";

export class OpenAIProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      maxRetries: 3,
    });
  }

  normalizeMessages(messages) {
    // OpenAI expects messages array with system/user/assistant/tool roles.
    // For tool results, Anthropic-style tool_result blocks must be converted.
    const normalized = [];
    for (const m of messages) {
      if (typeof m.content === "string") {
        normalized.push({ role: m.role, content: m.content });
        continue;
      }

      // content is array of blocks
      const textBlocks = [];
      const toolCalls = [];
      const toolResults = [];

      for (const block of m.content) {
        if (block.type === "text") {
          textBlocks.push(block.text);
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            type: "function",
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input || {}),
            },
          });
        } else if (block.type === "tool_result") {
          toolResults.push({
            role: "tool",
            tool_call_id: block.tool_use_id,
            content:
              typeof block.content === "string"
                ? block.content
                : JSON.stringify(block.content),
          });
        } else if (block.type === "thinking") {
          // OpenAI-compatible endpoints usually ignore thinking blocks;
          // include as text if the model supports it.
          textBlocks.push(`[thinking] ${block.thinking || ""}`);
        }
      }

      if (toolCalls.length > 0) {
        normalized.push({
          role: m.role,
          tool_calls: toolCalls,
          content: textBlocks.length > 0 ? textBlocks.join("\n") : null,
        });
      } else if (textBlocks.length > 0) {
        normalized.push({ role: m.role, content: textBlocks.join("\n") });
      }
      for (const tr of toolResults) {
        normalized.push(tr);
      }
    }
    return normalized;
  }

  async chat(messages, tools) {
    const normalizedMessages = this.normalizeMessages(messages);
    if (this.config.systemPrompt) {
      normalizedMessages.unshift({
        role: "system",
        content: this.config.systemPrompt,
      });
    }

    const requestPayload = {
      model: this.config.model,
      max_tokens: this.config.maxTokens || 4096,
      messages: normalizedMessages,
    };

    if (tools.length > 0) {
      requestPayload.tools = mcpToOpenAITools(tools);
      requestPayload.tool_choice = "auto";
    }

    const response = await this.client.chat.completions.create(requestPayload);
    const choice = response.choices[0];

    const result = {
      text: choice.message.content || "",
      thinking: [],
      toolCalls: (choice.message.tool_calls || []).map(openAIToolCallToMcp),
    };

    return result;
  }
}
