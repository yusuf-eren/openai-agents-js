import OpenAI from 'openai';
import dotenv from 'dotenv';
import { Agent } from './src/agents/agent';
import { FunctionTool, WebSearchTool } from './src/agents/tools';
import { Runner } from './src/agents/run';
import { ModelSettings } from './src/agents';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const weatherTool = new FunctionTool({
  name: 'get_weather',
  description: 'Get the current weather for a city',
  on_invoke_tool: async ({ context, input }) => {
    console.log('input', input);
    const parsedInput = JSON.parse(input);
    console.log('parsedInput', parsedInput);
    return {
      city: parsedInput.city,
      temperature: '25°C',
      conditions: 'Sunny',
    };
  },
  params_json_schema: {
    type: 'object',
    properties: {
      city: {
        type: 'string',
        description: 'The city to get weather for',
      },
    },
    required: ['city'],
  },
  strict_json_schema: false,
});

async function main() {
  const agent = new Agent({
    name: 'websearch-test',
    model: 'gpt-4o',
    model_settings: new ModelSettings({ parallel_tool_calls: true }),
    instructions: 'You are a helpful assistant that can search the web.',
    tools: [
      weatherTool,
      //   new WebSearchTool({
      //     user_location: {
      //       type: 'approximate',
      //     },
      //     search_context_size: 'medium',
      //   }),
    ],
  });

  const response = await Runner.run(
    agent,
    'What is the weather in Tokyo? also in Istanbul?'
  );

  console.log(response.finalOutput);
}

main();
