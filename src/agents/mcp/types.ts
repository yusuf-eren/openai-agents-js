import { Tool } from '@modelcontextprotocol/sdk/types.js';

export abstract class MCPTool implements Tool {
  [x: string]: unknown;
  abstract name: string;
  abstract inputSchema: any;
  abstract description?: string;
  abstract annotations?: {
    title?: string;
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
  };
}
