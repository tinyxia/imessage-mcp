import fs from "fs";
import path from "path";
import { homedir, hostname } from "os";
import { DEFAULTS } from "./shared/constants.js";

function resolveEnvRefs(value) {
  if (typeof value !== "string") return value;
  return value.replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] || "");
}

function deepResolveEnv(obj) {
  if (typeof obj === "string") return resolveEnvRefs(obj);
  if (Array.isArray(obj)) return obj.map(deepResolveEnv);
  if (obj && typeof obj === "object") {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = deepResolveEnv(v);
    }
    return out;
  }
  return obj;
}

export function parseArgs(argv) {
  const args = {
    mode: null, // 'server' | 'bridge'
    configPath: null,
    foreground: false,
    testConfig: false,
    installService: false,
    uninstall: false,
    status: false,
    help: false,
    version: false,
    masterHandle: null,
    provider: null,
    apiKey: null,
    baseUrl: null,
    model: null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--server":
        args.mode = "server";
        break;
      case "--bridge":
        args.mode = "bridge";
        break;
      case "--config":
        args.configPath = argv[++i];
        break;
      case "--foreground":
        args.foreground = true;
        break;
      case "--test-config":
        args.testConfig = true;
        break;
      case "--install-service":
        args.installService = true;
        break;
      case "--uninstall":
        args.uninstall = true;
        break;
      case "--status":
        args.status = true;
        break;
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--version":
      case "-v":
        args.version = true;
        break;
      case "--master-handle":
        args.masterHandle = argv[++i];
        break;
      case "--provider":
        args.provider = argv[++i];
        break;
      case "--api-key":
        args.apiKey = argv[++i];
        break;
      case "--base-url":
        args.baseUrl = argv[++i];
        break;
      case "--model":
        args.model = argv[++i];
        break;
    }
  }

  return args;
}

export function loadConfigFile(configPath) {
  if (!configPath) return {};
  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Config file not found: ${resolved}`);
  }
  const raw = JSON.parse(fs.readFileSync(resolved, "utf-8"));
  return deepResolveEnv(raw);
}

export function buildBridgeConfig(args) {
  const fileConfig = loadConfigFile(args.configPath) || {};

  // Try reading Claude Code settings for env fallbacks
  let claudeEnv = {};
  let claudeModel = null;
  try {
    const settingsPath = path.join(homedir(), ".claude/settings.json");
    if (fs.existsSync(settingsPath)) {
      const raw = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      claudeEnv = raw.env || {};
      claudeModel = raw.model || null;
    }
  } catch {
    // ignore
  }

  const cfg = {
    masterHandle:
      args.masterHandle ||
      fileConfig.masterHandle ||
      process.env.IMESSAGE_MASTER_HANDLE,
    provider:
      args.provider ||
      fileConfig.provider ||
      process.env.IMESSAGE_PROVIDER ||
      "anthropic",
    apiKey:
      args.apiKey ||
      fileConfig.apiKey ||
      process.env.ANTHROPIC_API_KEY ||
      process.env.ANTHROPIC_AUTH_TOKEN ||
      process.env.OPENAI_API_KEY ||
      claudeEnv.ANTHROPIC_AUTH_TOKEN ||
      claudeEnv.ANTHROPIC_API_KEY ||
      claudeEnv.OPENAI_API_KEY,
    baseUrl:
      args.baseUrl ||
      fileConfig.baseUrl ||
      process.env.ANTHROPIC_BASE_URL ||
      process.env.OPENAI_BASE_URL ||
      claudeEnv.ANTHROPIC_BASE_URL ||
      claudeEnv.OPENAI_BASE_URL,
    model:
      args.model ||
      fileConfig.model ||
      process.env.ANTHROPIC_MODEL ||
      process.env.OPENAI_MODEL ||
      claudeEnv.ANTHROPIC_MODEL ||
      claudeEnv.ANTHROPIC_DEFAULT_SONNET_MODEL ||
      claudeEnv.ANTHROPIC_DEFAULT_OPUS_MODEL ||
      claudeEnv.ANTHROPIC_DEFAULT_HAIKU_MODEL ||
      claudeModel || "claude-3-5-sonnet-20241022",
    maxTokens:
      fileConfig.maxTokens ||
      parseInt(process.env.IMESSAGE_MAX_TOKENS, 10) ||
      DEFAULTS.BRIDGE.maxTokens,
    pollIntervalMs:
      fileConfig.pollIntervalMs ||
      parseInt(process.env.IMESSAGE_POLL_INTERVAL_MS, 10) ||
      DEFAULTS.BRIDGE.pollIntervalMs,
    maxHistoryPerConversation:
      fileConfig.maxHistoryPerConversation ||
      DEFAULTS.BRIDGE.maxHistoryPerConversation,
    maxToolIterations:
      fileConfig.maxToolIterations || DEFAULTS.BRIDGE.maxToolIterations,
    sendProcessingIndicator:
      fileConfig.sendProcessingIndicator !== undefined
        ? fileConfig.sendProcessingIndicator
        : DEFAULTS.BRIDGE.sendProcessingIndicator,
    systemPrompt:
      fileConfig.systemPrompt || buildDefaultSystemPrompt(fileConfig.projectDir || homedir()),
    mcpServers: fileConfig.mcpServers || {},
    safety: {
      requireConfirmation: false,
      allowedTools: null,
      blockedTools: [],
      blockedCommands: ["rm -rf /", "sudo"],
      readOnly: false,
      ...fileConfig.safety,
    },
  };

  if (fileConfig.thinking) {
    cfg.thinking = fileConfig.thinking;
  }

  return cfg;
}

function buildDefaultSystemPrompt(projectDir) {
  const project = projectDir || "/Users/USER/Documents/project";
  return `你是运行在用户 Mac 电脑上的 AI 助手，通过 iMessage 与用户沟通。

## 核心能力
- 执行 Shell 命令来管理项目、查询系统状态、运行脚本等
- 读取和浏览文件系统中的文件
- 智能回答问题、提供技术建议和编程帮助
- 使用中文与用户交流

## 重要规则
- 保持回复简洁、有用。iMessage 有长度限制，长回复请分成多条发送。
- 如果用户的请求涉及项目代码，先用工具了解项目结构再回答。
- 对于不确定的内容，诚实告知用户，不要编造信息。
- 执行有风险的操作前（如删除文件、修改配置），先提醒用户。
- 工具箱中的 \`send_long_reply\` 用于发送超过一条 iMessage 的长回复，自动分多条发送。

## 运行环境
- 主机名: ${hostname()}
- 用户目录: ${homedir()}
- 当前项目目录: ${project}
`;
}

export function validateBridgeConfig(cfg) {
  if (!cfg.masterHandle) {
    throw new Error(
      "masterHandle is required. Set it via --master-handle, config file, or IMESSAGE_MASTER_HANDLE env."
    );
  }
  if (!cfg.apiKey) {
    throw new Error(
      "apiKey is required. Set it via --api-key, config file, or ANTHROPIC_API_KEY/OPENAI_API_KEY env."
    );
  }
  if (!cfg.model) {
    throw new Error("model is required.");
  }
}
