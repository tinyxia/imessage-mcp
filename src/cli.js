import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { parseArgs } from "./config.js";
import { startServer } from "./server/index.js";
import { startBridge } from "./bridge/index.js";
import { LOG } from "./shared/utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PKG_PATH = path.join(__dirname, "..", "package.json");
const INSTALL_SCRIPT = path.join(__dirname, "..", "scripts", "install-launchagent.sh");

function showHelp() {
  console.log(`
imessage-mcp-server — MCP server and AI bridge for iMessage on macOS

Usage:
  npx imessage-mcp-server --server              Start the MCP server (stdio)
  npx imessage-mcp-server --bridge --config ... Start the bridge daemon
  npx imessage-mcp-server --help                Show this help
  npx imessage-mcp-server --version             Show version

MCP Server mode:
  --server                                      Start as MCP Server

Bridge mode:
  --bridge                                      Start as AI bridge daemon
  --config <path>                               Path to bridge-config.json
  --foreground                                  Run in foreground (don't daemonize)
  --test-config                                 Validate config and MCP connections
  --install-service                             Install as macOS LaunchAgent
  --uninstall                                   Uninstall LaunchAgent
  --status                                      Check LaunchAgent status

Bridge options (override config file):
  --master-handle <handle>                      Your iMessage handle
  --provider <anthropic|openai>                 LLM provider
  --api-key <key>                               API key
  --base-url <url>                              Custom API base URL
  --model <model>                               Model name

Environment variables:
  IMESSAGE_DB_PATH                              Path to chat.db
  ANTHROPIC_API_KEY / OPENAI_API_KEY            API keys
`);
}

function showVersion() {
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf-8"));
  console.log(pkg.version);
}

function runInstallScript(action, configPath) {
  if (!fs.existsSync(INSTALL_SCRIPT)) {
    console.error("Install script not found:", INSTALL_SCRIPT);
    process.exit(1);
  }
  const parts = [INSTALL_SCRIPT, action];
  if (configPath) parts.push(configPath);
  const quoted = parts.map((p) => `"${p.replace(/"/g, '\\"')}"`).join(" ");
  execSync(`bash ${quoted}`, { stdio: "inherit" });
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  if (args.version) {
    showVersion();
    process.exit(0);
  }

  // Platform check
  if (process.platform !== "darwin") {
    console.error(
      "❌ iMessage MCP only supports macOS (detected: " + process.platform + ")"
    );
    process.exit(1);
  }

  // osascript check
  try {
    execSync("which osascript", { encoding: "utf-8", stdio: "pipe" });
  } catch {
    console.error("❌ osascript not found. This tool requires macOS.");
    process.exit(1);
  }

  // Default to help when no arguments provided
  if (!args.mode && argv.length === 0) {
    showHelp();
    process.exit(0);
  }

  try {
    if (args.mode === "server") {
      await startServer();
    } else if (args.mode === "bridge") {
      if (args.installService) {
        runInstallScript("load", args.configPath);
        return;
      }
      if (args.uninstall) {
        runInstallScript("unload", args.configPath);
        return;
      }
      if (args.status) {
        runInstallScript("status", args.configPath);
        return;
      }
      await startBridge(args);
    } else {
      console.error("Unknown mode. Use --server or --bridge.");
      process.exit(1);
    }
  } catch (err) {
    LOG.error("Fatal error", { error: err.message, stack: err.stack });
    process.exit(1);
  }
}
