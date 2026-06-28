export function mcpToAnthropicTools(mcpTools) {
  return mcpTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema || { type: "object", properties: {} },
  }));
}

export function mcpToOpenAITools(mcpTools) {
  return mcpTools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema || { type: "object", properties: {} },
    },
  }));
}

export function openAIToolCallToMcp(toolCall) {
  return {
    id: toolCall.id,
    name: toolCall.function.name,
    input: JSON.parse(toolCall.function.arguments || "{}"),
  };
}

export class BaseProvider {
  constructor(config) {
    this.config = config;
  }

  // eslint-disable-next-line no-unused-vars
  async chat(messages, tools) {
    throw new Error("Not implemented");
  }
}
