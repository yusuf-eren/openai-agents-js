import { z } from 'zod';
import { Agent, FunctionTool, Runner } from '../../src/agents';

const WeatherSchema = z.object({
  city: z.string(),
  temperatureRange: z.string(),
  conditions: z.string(),
});

type Weather = z.infer<typeof WeatherSchema>;
const getWeather = new FunctionTool({
  name: 'get_weather',
  description: 'Get the current weather for a city',
  on_invoke_tool: async ({ context, input }) => {
    const parsedInput = JSON.parse(input);
    return {
      city: parsedInput.city,
      temperatureRange: '14-20C',
      conditions: 'Sunny with wind.',
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

const agent = new Agent({
  name: 'Hello world',
  instructions: 'You are a helpful agent.',
  tools: [getWeather],
});

async function main() {
  const result = await Runner.run(agent, "What's the weather in Tokyo?");
  console.log(result.finalOutput);
  // The weather in Tokyo is sunny.
}

main().catch(console.error);
