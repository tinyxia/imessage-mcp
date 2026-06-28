import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { DEFAULTS } from "../shared/constants.js";
import { TOOLS } from "./tools.js";

export async function startServer() {
  const server = new Server(
    {
      name: DEFAULTS.SERVER.name,
      version: DEFAULTS.SERVER.version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: Object.entries(TOOLS).map(([name, tool]) => ({
        name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const tool = TOOLS[name];
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return tool.handler(args ?? {});
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("iMessage MCP Server running on stdio");
}
