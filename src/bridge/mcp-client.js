import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { LOG } from "../shared/utils.js";

export class McpClientManager {
  constructor(mcpServersConfig = {}) {
    this.config = mcpServersConfig;
    this.clients = new Map(); // serverId -> { client, transport, tools }
  }

  async connectAll() {
    const entries = Object.entries(this.config);
    if (entries.length === 0) {
      LOG.info("No MCP servers configured");
      return;
    }

    await Promise.all(
      entries.map(([serverId, serverConfig]) =>
        this.connectServer(serverId, serverConfig)
      )
    );
  }

  async connectServer(serverId, serverConfig) {
    try {
      const transport = new StdioClientTransport({
        command: serverConfig.command,
        args: serverConfig.args || [],
        env: { ...process.env, ...(serverConfig.env || {}) },
      });

      const client = new Client(
        {
          name: "imessage-bridge",
          version: "2.0.0",
        },
        {
          capabilities: {},
        }
      );

      await client.connect(transport);
      const toolsResult = await client.listTools();
      const tools = toolsResult.tools || [];

      this.clients.set(serverId, { client, transport, tools });
      LOG.info(`MCP server connected`, { serverId, tools: tools.length });
    } catch (err) {
      LOG.error(`Failed to connect MCP server ${serverId}`, {
        error: err.message,
      });
    }
  }

  getAllTools() {
    const all = [];
    for (const [serverId, { tools }] of this.clients) {
      for (const t of tools) {
        all.push({
          ...t,
          serverId,
        });
      }
    }
    return all;
  }

  async callTool(name, input) {
    for (const [serverId, { client, tools }] of this.clients) {
      const found = tools.find((t) => t.name === name);
      if (found) {
        LOG.info(`Calling MCP tool`, { serverId, name });
        const result = await client.callTool({ name, arguments: input });
        return this.extractToolResult(result);
      }
    }
    throw new Error(`Tool ${name} not found in any connected MCP server`);
  }

  extractToolResult(result) {
    if (!result || !result.content) return "";
    return result.content
      .map((c) => {
        if (c.type === "text") return c.text;
        if (c.type === "image") return "[image]";
        return JSON.stringify(c);
      })
      .join("\n");
  }

  async close() {
    await Promise.all(
      Array.from(this.clients.values()).map(({ client }) =
        client.close().catch(() => {})
      )
    );
    this.clients.clear();
  }
}
