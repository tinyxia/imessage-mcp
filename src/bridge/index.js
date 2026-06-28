import { validateBridgeConfig, buildBridgeConfig } from "../config.js";
import { McpClientManager } from "./mcp-client.js";
import { BridgeDaemon } from "./daemon.js";
import { LOG } from "../shared/utils.js";

export async function startBridge(args) {
  const config = buildBridgeConfig(args);
  validateBridgeConfig(config);

  const mcpManager = new McpClientManager(config.mcpServers);
  const daemon = new BridgeDaemon(config, mcpManager);

  if (args.testConfig) {
    LOG.info("Testing bridge configuration...");
    await mcpManager.connectAll();
    const tools = mcpManager.getAllTools();
    LOG.info("Configuration valid", {
      provider: config.provider,
      model: config.model,
      mcpServers: Object.keys(config.mcpServers).length,
      toolsAvailable: tools.length,
    });
    for (const t of tools) {
      LOG.info(`  - ${t.name} (${t.serverId})`);
    }
    await mcpManager.close();
    return;
  }

  await daemon.run();
}
