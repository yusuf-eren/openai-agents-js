# OpenAI Agents SDK

The [OpenAI Agents SDK](https://github.com/yusuf-eren/openai-agents-js) enables you to build agentic AI apps in a lightweight, easy-to-use package with very few abstractions. It's a production-ready upgrade of our previous experimentation for agents, [Swarm](https://github.com/openai/swarm/tree/main). The Agents SDK has a very small set of primitives:

* **Agents**, which are LLMs equipped with instructions and tools
* **Handoffs**, which allow agents to delegate to other agents for specific tasks
* **Guardrails**, which enable the inputs to agents to be validated

In combination with JavaScript/TypeScript, these primitives are powerful enough to express complex relationships between tools and agents, and allow you to build real-world applications without a steep learning curve. In addition, the SDK comes with built-in **tracing** that lets you visualize and debug your agentic flows, as well as evaluate them and even fine-tune models for your application.

## Why use the Agents SDK

The SDK has two driving design principles:

1. Enough features to be worth using, but few enough primitives to make it quick to learn.
2. Works great out of the box, but you can customize exactly what happens.

Here are the main features of the SDK:

* Agent loop: Built-in agent loop that handles calling tools, sending results to the LLM, and looping until the LLM is done.
* TypeScript-first: Use built-in language features to orchestrate and chain agents, rather than needing to learn new abstractions.
* Handoffs: A powerful feature to coordinate and delegate between multiple agents.
* Guardrails: Run input validations and checks in parallel to your agents, breaking early if the checks fail.
* Function tools: Turn any JavaScript/TypeScript function into a tool, with automatic schema generation and validation.
* Tracing: Built-in tracing that lets you visualize, debug and monitor your workflows, as well as use the OpenAI suite of evaluation, fine-tuning and distillation tools.

## Installation

```bash
npm install openai-agents-js
```

## Hello world example

```typescript
import { Agent, Runner } from 'openai-agents-js';

async function main() {
  const agent = new Agent({
    name: 'Assistant',
    instructions: 'You only respond in haikus.',
  });

  const result = await Runner.run(agent, 'Tell me about recursion in programming.');
  console.log(result.finalOutput);
  // Function calls itself,
  // Looping in smaller pieces,
  // Endless by design.
}

main();
```

(_If running this, ensure you set the `OPENAI_API_KEY` environment variable_)

```bash
export OPENAI_API_KEY=sk-...
``` 