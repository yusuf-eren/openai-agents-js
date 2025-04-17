import 'dotenv/config';
import { Agent } from './src/agents/agent';
import { Runner, RunConfig } from './src/agents/run';
import { FunctionTool, WebSearchTool } from './src/agents/tools';
import { RunContextWrapper } from './src/agents/run-context';
import { OpenAIProvider } from './src/agents/models/openai-provider';
import { Usage } from './src/agents/usage';

class WeatherTool extends FunctionTool {
  constructor({
    name,
    description,
    params_json_schema,
    on_invoke_tool,
    strict_json_schema,
  }: {
    name: string;
    description: string;
    params_json_schema: any;
    strict_json_schema: boolean;
    on_invoke_tool: (
      ctx: RunContextWrapper<any>,
      input: string
    ) => Promise<any>;
  }) {
    super({
      name,
      description,
      params_json_schema,
      strict_json_schema,
      on_invoke_tool: ({ context, input }) => {
        return Promise.resolve('24 celsius');
      },
    });
  }
}

async function main() {
  const agent = new Agent({
    name: 'Assistant',
    instructions:
      'You have web search tool at your disposal. Call it and get the weather in Istanbul.',
    tools: [new WebSearchTool({})],
    model: 'gpt-4o', // Change to gpt-4o or gpt-4-turbo
  });

  const anotherAgent = agent.clone({
    name: 'Bu klonlandı',
  });

  console.log(
    anotherAgent,
    JSON.stringify(agent.asTool('weather', 'Get the weather in Istanbul'))
  );

  // // --- Explicitly create provider and config ---
  // const provider = new OpenAIProvider({ useResponses: false });
  // const runConfig = new RunConfig();
  // runConfig.modelProvider = provider;
  // // --- End explicit creation ---

  // const result = await Runner.run(agent, 'what is the weather in Istanbul?', {
  //   maxTurns: 5,
  //   runConfig: runConfig, // Pass the explicit runConfig
  // });
  // console.log(JSON.stringify(result, null, 2));
  // Print full result, not just rawResponses
}

main();
