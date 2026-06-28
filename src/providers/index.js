import { AnthropicProvider } from "./anthropic.js";
import { OpenAIProvider } from "./openai.js";

export function createProvider(config) {
  const provider = config.provider || "anthropic";
  switch (provider.toLowerCase()) {
    case "anthropic":
    case "claude":
      return new AnthropicProvider(config);
    case "openai":
    case "deepseek":
    case "kimi":
      return new OpenAIProvider(config);
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export { AnthropicProvider, OpenAIProvider };
