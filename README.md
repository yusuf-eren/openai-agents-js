# OpenAI Agents SDK Node.js

The OpenAI Agents SDK Node.js is a TypeScript port of the official [OpenAI Agents SDK](https://github.com/openai/openai-agents-python). This library provides the exact same functionality and API as the Python version, but implemented in TypeScript/JavaScript for Node.js environments.

> **Note**: This is an unofficial TypeScript port of the official OpenAI Agents SDK. While it maintains feature parity with the Python version, it's not officially supported by OpenAI.

### Feature Parity

This TypeScript implementation maintains complete feature parity with the official Python SDK, including:

- ✅ Agent creation and management
- ✅ Tool integration
- ✅ Handoffs between agents
- ✅ Model settings and configuration
- ✅ Response handling
- ✅ Streaming support

The only differences are:
- Language-specific syntax (TypeScript/JavaScript instead of Python)
- Node.js-specific environment handling
- TypeScript type definitions for better development experience

### Core concepts:

1. **Agents**: LLMs configured with instructions, tools, guardrails, and handoffs
2. **Handoffs**: A specialized tool call used for transferring control between agents
3. **Tools**: Functions that agents can call to perform specific tasks
4. **Model Settings**: Configurable parameters for controlling model behavior

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

## Basic example

```typescript
import { Agent, Runner } from 'openai-agents';

const agent = new Agent({
  name: "Assistant",
  instructions: "You are a helpful assistant"
});

const result = await Runner.run(agent, "Write a haiku about recursion in programming.");
console.log(result.finalOutput);

// Code within the code,
// Functions calling themselves,
// Infinite loop's dance.
```

## Handoffs example

```typescript
import { Agent, Runner } from 'openai-agents';

const spanishAgent = new Agent({
  name: "Spanish agent",
  instructions: "You only speak Spanish."
});

const englishAgent = new Agent({
  name: "English agent",
  instructions: "You only speak English"
});

const triageAgent = new Agent({
  name: "Triage agent",
  instructions: "Handoff to the appropriate agent based on the language of the request.",
  handoffs: [spanishAgent, englishAgent]
});

const result = await Runner.run(triageAgent, "Hola, ¿cómo estás?");
console.log(result.finalOutput);
// ¡Hola! Estoy bien, gracias por preguntar. ¿Y tú, cómo estás?
```

## Tools example

```typescript
import { Agent, Runner, FunctionTool } from 'openai-agents';

const weatherTool = new FunctionTool({
  name: 'get_weather',
  description: 'Get the weather for a city',
  params_json_schema: {
    type: 'object',
    properties: {
      city: { type: 'string' }
    },
    required: ['city']
  },
  on_invoke_tool: async ({ input }) => {
    return `The weather in ${input.city} is sunny.`;
  }
});

const agent = new Agent({
  name: "Weather Agent",
  instructions: "You are a helpful weather assistant.",
  tools: [weatherTool]
});

const result = await Runner.run(agent, "What's the weather in Tokyo?");
console.log(result.finalOutput);
// The weather in Tokyo is sunny.
```

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

1. If you set an `outputType` on the agent, the final output is when the LLM returns something of that type.
2. If there's no `outputType`, then the first LLM response without any tool calls or handoffs is considered as the final output.

## Contributing

This is an open-source project developed by the community. Contributions are welcome and appreciated! Here's how you can help:

1. Report bugs and issues
2. Suggest new features
3. Improve documentation
4. Submit pull requests
5. Share your use cases and examples

To contribute:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

Please ensure your code follows the project's coding standards and includes appropriate tests.

## Development Status

- ✅ Core agent functionality
- ✅ Tool support
- ✅ Handoffs
- ✅ Model settings
- 🔄 Tracing (in development)
- 🔄 Advanced examples (in development)
- 🔄 Logging structure (to be refined)

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