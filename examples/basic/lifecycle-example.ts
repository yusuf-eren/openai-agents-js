const readline = require('node:readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

import { z } from 'zod';
import {
  Agent,
  RunContextWrapper,
  RunHooks,
  Runner,
  Tool,
  Usage,
  FunctionTool,
  WebSearchTool,
} from '../../src/agents';

class ExampleHooks extends RunHooks<RunContextWrapper> {
  private event_counter: number = 0;

  private _usage_to_str(usage: Usage): string {
    return `${usage.requests} requests, ${usage.input_tokens} input tokens, ${usage.output_tokens} output tokens, ${usage.total_tokens} total tokens`;
  }

  async onAgentStart(
    context: RunContextWrapper,
    agent: Agent<RunContextWrapper>
  ): Promise<void> {
    this.event_counter += 1;
    console.log(
      `### ${this.event_counter}: Agent ${
        agent.name
      } started. Usage: ${this._usage_to_str(context.usage)}`
    );
  }

  async onAgentEnd(
    context: RunContextWrapper,
    agent: Agent<RunContextWrapper>,
    output: any
  ): Promise<void> {
    this.event_counter += 1;
    console.log(
      `### ${this.event_counter}: Agent ${
        agent.name
      } ended with output ${output}. Usage: ${this._usage_to_str(
        context.usage
      )}`
    );
  }

  async onToolStart(
    context: RunContextWrapper,
    agent: Agent<RunContextWrapper>,
    tool: Tool
  ): Promise<void> {
    this.event_counter += 1;
    console.log(
      `### ${this.event_counter}: Tool ${
        tool.name
      } started. Usage: ${this._usage_to_str(context.usage)}`
    );
  }

  async onToolEnd(
    context: RunContextWrapper,
    agent: Agent<RunContextWrapper>,
    tool: Tool,
    result: string
  ): Promise<void> {
    this.event_counter += 1;
    console.log(
      `### ${this.event_counter}: Tool ${
        tool.name
      } ended with result ${result}. Usage: ${this._usage_to_str(
        context.usage
      )}`
    );
  }

  async onHandoff(
    context: RunContextWrapper,
    fromAgent: Agent<RunContextWrapper>,
    toAgent: Agent<RunContextWrapper>
  ): Promise<void> {
    this.event_counter += 1;
    console.log(
      `### ${this.event_counter}: Handoff from ${fromAgent.name} to ${
        toAgent.name
      }. Usage: ${this._usage_to_str(context.usage)}`
    );
  }
}

const hooks = new ExampleHooks();

const randomNumber = new FunctionTool({
  name: 'random_number',
  description: 'Generate a random number up to the provided max.',
  params_json_schema: {
    type: 'object',
    properties: {
      max: { type: 'number' },
    },
    required: ['max'],
  },
  on_invoke_tool: async ({ context, input }) => {
    const max = JSON.parse(input).max;
    return Math.floor(Math.random() * (max + 1));
  },
});

const multiplyByTwo = new FunctionTool({
  name: 'multiply_by_two',
  description: 'Return x times two.',
  params_json_schema: {
    type: 'object',
    properties: {
      x: { type: 'number' },
    },
    required: ['x'],
  },
  on_invoke_tool: async ({ context, input }) => {
    const x = JSON.parse(input).x;
    return x * 2;
  },
});

const FinalResult = z.object({
  number: z.number(),
});

const multiplyAgent = new Agent({
  name: 'Multiply Agent',
  instructions: 'Multiply the number by 2 and then return the final result.',
  tools: [multiplyByTwo],
  output_type: FinalResult,
});

const startAgent = new Agent({
  name: 'Start Agent',
  instructions:
    "Generate a random number. If it's even, stop. If it's odd, hand off to the multiplier agent.",
  tools: [randomNumber, new WebSearchTool({})],
  output_type: FinalResult,
  handoffs: [multiplyAgent],
});

async function main(): Promise<void> {
  const userInput = await new Promise<string>((resolve) => {
    rl.question('Enter a max number: ', (answer: string) => {
      rl.close();
      resolve(answer || '0');
    });
  });
  const result = await Runner.run(
    startAgent,
    `Generate a random number between 0 and ${userInput}.`,
    {
      hooks,
    }
  );

  console.log(result.finalOutput);
  console.log('Done!');
}

main();
