import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
    ListToolsResult,
    CallToolResult,
    CompatibilityCallToolResult
} from '@modelcontextprotocol/sdk/types';

export type ToolCallOutput = CompatibilityCallToolResult;

export abstract class MCPServer {
    abstract connect(): Promise<void>;
    abstract cleanup(): Promise<void>;
    abstract listTools(): Promise<ListToolsResult>;
    abstract callTool(
        toolName: string,
        args?: Record<string, any>
    ): Promise<CallToolResult | CompatibilityCallToolResult>;
    abstract name: string;
}

export class MCPServerStdio extends MCPServer {
    client: Client;
    transport: StdioClientTransport;
    private toolsCache?: ListToolsResult;
    readonly name: string;

    constructor(
        private command: string,
        private args: string[] = [],
        name?: string,
        private cacheTools = true
    ) {
        super();
        this.name = name ?? `stdio:${this.command}`;
        this.transport = new StdioClientTransport({
            command: this.command,
            args: this.args
        });
        this.client = new Client({ name: this.name, version: '1.0.0' });
        this.connect();
    }

    async connect(): Promise<void> {
        await this.client.connect(this.transport);
    }

    async listTools(): Promise<ListToolsResult> {
        if (this.cacheTools && this.toolsCache) return this.toolsCache;
        const tools = await this.client.listTools();
        if (this.cacheTools) this.toolsCache = tools;
        return tools;
    }

    async callTool(
        toolName: string,
        args: Record<string, any> = {}
    ): Promise<ToolCallOutput> {
        return this.client.callTool({
            name: toolName,
            arguments: args
        });
    }

    async cleanup(): Promise<void> {
        await this.transport.close();
    }
}

export class MCPServerSse extends MCPServer {
    client: Client;
    transport: StreamableHTTPClientTransport;
    private toolsCache?: ListToolsResult;
    readonly name: string;

    constructor(private url: string, name?: string, private cacheTools = true) {
        super();
        this.name = name ?? `http:${this.url}`;
        this.transport = new StreamableHTTPClientTransport(new URL(this.url));
        this.client = new Client({ name: this.name, version: '1.0.0' });
        this.connect();
    }

    async connect(): Promise<void> {
        await this.client.connect(this.transport);
    }

    async listTools(): Promise<ListToolsResult> {
        if (this.cacheTools && this.toolsCache) return this.toolsCache;
        const tools = await this.client.listTools();
        if (this.cacheTools) this.toolsCache = tools;
        return tools;
    }

    async callTool(
        toolName: string,
        args: Record<string, any> = {}
    ): Promise<ToolCallOutput> {
        return this.client.callTool({ name: toolName, arguments: args });
    }

    async cleanup(): Promise<void> {
        await this.transport.close();
    }
}
