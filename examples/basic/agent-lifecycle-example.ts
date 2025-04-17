import { z } from 'zod';
import {
  Agent,
  AgentHooks,
  FunctionTool,
  Runner,
  Tool,
  RunContextWrapper,
} from '../../src/agents';

class CustomAgentHooks implements AgentHooks<RunContextWrapper> {
  private eventCounter = 0;

  constructor(private displayName: string) {}

  async onStart(
    context: RunContextWrapper,
    agent: Agent<RunContextWrapper>
  ): Promise<void> {
    this.eventCounter++;
    console.log(
      `### (${this.displayName}) ${this.eventCounter}: Agent ${agent.name} started`
    );
  }

  async onEnd(
    context: RunContextWrapper,
    agent: Agent<RunContextWrapper>,
    output: any
  ): Promise<void> {
    this.eventCounter++;
    console.log(
      `### (${this.displayName}) ${this.eventCounter}: Agent ${
        agent.name
      } ended with output ${JSON.stringify(output)}`
    );
  }

  async onHandoff(
    context: RunContextWrapper,
    agent: Agent<RunContextWrapper>,
    source: Agent<RunContextWrapper>
  ): Promise<void> {
    this.eventCounter++;
    console.log(
      `### (${this.displayName}) ${this.eventCounter}: Agent ${source.name} handed off to ${agent.name}`
    );
  }

  async onToolStart(
    context: RunContextWrapper,
    agent: Agent<RunContextWrapper>,
    tool: Tool
  ): Promise<void> {
    this.eventCounter++;
    console.log(
      `### (${this.displayName}) ${this.eventCounter}: Agent ${agent.name} started tool ${tool.name}`
    );
  }

  async onToolEnd(
    context: RunContextWrapper,
    agent: Agent<RunContextWrapper>,
    tool: Tool,
    result: any
  ): Promise<void> {
    this.eventCounter++;
    console.log(
      `### (${this.displayName}) ${this.eventCounter}: Agent ${agent.name} ended tool ${tool.name} with result ${result}`
    );
  }
}

const randomNumber = new FunctionTool({
  name: 'random_number',
  description: 'Generate a random number up to the provided maximum.',
  params_json_schema: {
    type: 'object',
    properties: {
      max: { type: 'number' },
    },
    required: ['max'],
  },
  on_invoke_tool: async ({ input }) => {
    return Math.floor(Math.random() * (JSON.parse(input).max + 1));
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

const FinalOutputSchema = z.object({
  number: z.number(),
});

const multiplyAgent = new Agent({
  name: 'Multiply Agent',
  instructions: 'Multiply the number by 2 and then return the final result.',
  tools: [multiplyByTwo],
  output_type: FinalOutputSchema,
  hooks: new CustomAgentHooks('Multiply Agent'),
});

const startAgent = new Agent({
  name: 'Start Agent',
  instructions:
    "Generate a random number. If it's even, stop. If it's odd, hand off to the multiply agent.",
  tools: [randomNumber],
  output_type: FinalOutputSchema,
  handoffs: [multiplyAgent],
  hooks: new CustomAgentHooks('Start Agent'),
});

async function main() {
  const maxNum = 250; // In a real app, get this from user input
  await Runner.run(
    startAgent,
    `Generate a random number between 0 and ${maxNum}.`
  );

  console.log('Done!');
}

main();
