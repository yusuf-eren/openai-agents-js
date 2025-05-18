import { Tool } from '@modelcontextprotocol/sdk/types';
import { MCPServer, ToolCallOutput } from './server';
import { FunctionTool } from '../tools/index';

export class MCPUtil {
  static async getFunctionTools(servers: MCPServer[]): Promise<FunctionTool[]> {
    const all: FunctionTool[] = [];
    const toolNames = new Set<string>();

    for (const server of servers) {
      const tools = await server.listTools();
      for (const tool of tools.tools) {
        if (toolNames.has(tool.name)) {
          throw new Error(`Duplicate tool name "${tool.name}" across MCP servers`);
        }
        toolNames.add(tool.name);
        all.push(MCPUtil.toFunctionTool(tool, server));
      }
    }

    return all;
  }

  static toFunctionTool(tool: Tool, server: MCPServer): FunctionTool {
    return new FunctionTool({
      name: tool.name,
      description: tool.description ?? '',
      params_json_schema: tool.inputSchema ?? {
        type: 'object',
        properties: {},
      },
      on_invoke_tool: async ({ input }) => {
        const args = JSON.parse(input ?? '{}');
        const result: ToolCallOutput = await server.callTool(tool.name, args);

        const content: any = result.content ?? [];
        if (content.length === 1 && content[0].type === 'text') {
          return content[0].text;
        }
        return JSON.stringify(content.map((c: any) => (c.type === 'text' ? c.text : c)));
      },
      strict_json_schema: false, // could enhance this if needed
    });
  }
}
