# OpenAI Agents SDK

This is a TypeScript port of the official [OpenAI Agents SDK](https://github.com/openai/openai-agents-python). This library maintains complete feature parity with the Python version, providing the exact same functionality, API design, and implementation patterns, just implemented in TypeScript/JavaScript for Node.js environments.

The OpenAI Agents SDK is a lightweight yet powerful framework for building multi-agent workflows. It is provider-agnostic, supporting the OpenAI Responses and Chat Completions APIs, as well as 100+ other LLMs.

### Core concepts:

1. **Agents**: LLMs configured with instructions, tools, guardrails, and handoffs
2. **Handoffs**: A specialized tool call used by the Agents SDK for transferring control between agents
3. **Guardrails**: Configurable safety checks for input and output validation
4. **Tracing**: Built-in tracking of agent runs, allowing you to view, debug and optimize your workflows

Explore the [examples](examples) directory to see the SDK in action, and read our [documentation](https://yusuf-eren.github.io/openai-agents-js/) for more details.

## Get started

1. Install the package:

```bash
npm install openai-agents-js
```

2. Set up your environment:

Create a `.env` file in your project root:

```bash
OPENAI_API_KEY=your_api_key_here
```

Or set it directly in your shell:

```bash
export OPENAI_API_KEY=your_api_key_here
```

## Hello world example

```typescript
import { Agent, Runner } from 'openai-agents-js';

const agent = new Agent({
  name: 'Assistant',
  instructions: 'You are a helpful assistant',
});

const result = await Runner.run(agent, 'Write a haiku about recursion in programming.');
console.log(result.finalOutput);

// Code within the code,
// Functions calling themselves,
// Infinite loop's dance.
```

## Handoffs example

```typescript
import { Agent, Runner } from 'openai-agents-js';

const spanishAgent = new Agent({
  name: 'Spanish agent',
  instructions: 'You only speak Spanish.',
});

const englishAgent = new Agent({
  name: 'English agent',
  instructions: 'You only speak English',
});

const triageAgent = new Agent({
  name: 'Triage agent',
  instructions: 'Handoff to the appropriate agent based on the language of the request.',
  handoffs: [spanishAgent, englishAgent],
});

const result = await Runner.run(triageAgent, 'Hola, ¿cómo estás?');
console.log(result.finalOutput);
// ¡Hola! Estoy bien, gracias por preguntar. ¿Y tú, cómo estás?
```

## Functions example

```typescript
import { Agent, Runner, FunctionTool } from 'openai-agents-js';

const weatherTool = new FunctionTool({
  name: 'get_weather',
  description: 'Get the weather for a city',
  params_json_schema: {
    type: 'object',
    properties: {
      city: { type: 'string' },
    },
    required: ['city'],
  },
  on_invoke_tool: async ({ input }) => {
    return `The weather in ${input.city} is sunny.`;
  },
});

const agent = new Agent({
  name: 'Weather Agent',
  instructions: 'You are a helpful weather assistant.',
  tools: [weatherTool],
});

const result = await Runner.run(agent, "What's the weather in Tokyo?");
console.log(result.finalOutput);
// The weather in Tokyo is sunny.
```

## MCP (Model Context Protocol) example

The Agents SDK supports the Model Context Protocol (MCP), which allows agents to interact with external services through a standardized interface. Here's an example using the filesystem MCP server:

```typescript
import { Agent, Runner, MCPServerStdio } from 'openai-agents-js';
import path from 'path';

async function main() {
  const currentFileDir = path.dirname(process.argv[1]);

  // Initialize the filesystem MCP server
  const mcp = [new MCPServerStdio('npx', ['-y', '@modelcontextprotocol/server-filesystem', currentFileDir])];

  // Create an agent with MCP server integration
  const agent = new Agent({
    name: 'Assistant',
    instructions: `Use the tools to read the filesystem and answer questions based on those files.`,
    mcp_servers: mcp,
  });

  // Example queries using the filesystem
  const result = await Runner.run(agent, 'Read the files and list them.');
  console.log(result.finalOutput);

  const result2 = await Runner.run(agent, 'What is my #1 favorite book?');
  console.log(result2.finalOutput);
}

main();
```

This example demonstrates how to:

1. Set up an MCP server for filesystem access
2. Configure an agent to use the MCP server
3. Query the filesystem through the agent

The MCP server provides tools like `list_directory()`, `read_file()`, etc., which the agent can use to interact with the filesystem.

## The agent loop

When you call `Runner.run()`, we run a loop until we get a final output:

1. We call the LLM, using the model and settings on the agent, and the message history.
2. The LLM returns a response, which may include tool calls.
3. If the response has a final output, we return it and end the loop.
4. If the response has a handoff, we set the agent to the new agent and go back to step 1.
5. We process the tool calls (if any) and append the tool responses messages. Then we go to step 1.

You can limit the number of iterations using the `maxTurns` parameter.

### Final output

Final output is determined by:

1. If you set an `output_type` on the agent, the final output is when the LLM returns something of that type.
2. If there's no `output_type`, then the first LLM response without any tool calls or handoffs is considered as the final output.

## Common agent patterns

The Agents SDK is designed to be highly flexible, allowing you to model a wide range of LLM workflows including deterministic flows, iterative loops, and more. See examples in the `examples` directory.

## Tracing

The Agents SDK automatically traces your agent runs, making it easy to track and debug the behavior of your agents. Tracing is extensible by design, supporting custom spans and a wide variety of external destinations.

## Development

1. Install dependencies:

```bash
npm install
```

2. Build the project:

```bash
npm run build
```

3. Run tests:

```bash
npm test
```

## Acknowledgements

We'd like to acknowledge the excellent work of the open-source community, especially:

- [OpenAI](https://openai.com/) for their API and inspiration
- [TypeScript](https://www.typescriptlang.org/) for the language
- [Node.js](https://nodejs.org/) for the runtime

We're committed to continuing to build the Agents SDK as an open source framework so others in the community can expand on our approach.
