import { Anthropic } from "@anthropic-ai/sdk";
import { BaseProvider, mcpToAnthropicTools } from "./base.js";

export class AnthropicProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.client = new Anthropic({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      maxRetries: 3,
    });
  }

  normalizeMessages(messages) {
    // Anthropic requires alternating user/assistant roles.
    // We collapse consecutive same-role blocks.
    const normalized = [];
    for (const m of messages) {
      if (normalized.length === 0) {
        normalized.push({ ...m });
        continue;
      }
      const last = normalized[normalized.length - 1];
      if (last.role === m.role) {
        // Merge content arrays
        last.content = last.content.concat(m.content);
      } else {
        normalized.push({ ...m });
      }
    }
    return normalized;
  }

  async chat(messages, tools) {
    const requestPayload = {
      model: this.config.model,
      max_tokens: this.config.maxTokens || 4096,
      system: this.config.systemPrompt || undefined,
      messages: this.normalizeMessages(messages),
    };

    if (tools.length > 0) {
      requestPayload.tools = mcpToAnthropicTools(tools);
    }

    if (this.config.thinking?.enabled) {
      requestPayload.thinking = {
        type: "enabled",
        budget_tokens: this.config.thinking.budgetTokens || 1024,
      };
    }

    const response = await this.client.messages.create(requestPayload);

    const result = {
      text: "",
      thinking: [],
      toolCalls: [],
    };

    for (const block of response.content) {
      if (block.type === "text") {
        result.text = block.text;
      } else if (block.type === "thinking") {
        result.thinking.push({
          thinking: block.thinking || "",
          signature: block.signature,
        });
      } else if (block.type === "tool_use") {
        result.toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input || {},
        });
      }
    }

    return result;
  }
}
