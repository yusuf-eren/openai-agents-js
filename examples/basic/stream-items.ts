import { z } from 'zod';
import { Agent, FunctionTool, ItemHelpers, Runner } from '../../src/agents';

const howManyJokes = new FunctionTool({
  name: 'how_many_jokes',
  description: 'Get a random number of jokes to tell',
  params_json_schema: {
    type: 'object',
    properties: {},
    required: [],
  },
  on_invoke_tool: async () => {
    return Math.floor(Math.random() * 10) + 1;
  },
});

const agent = new Agent({
  name: 'Joker',
  instructions:
    'First call the `how_many_jokes` tool, then tell that many jokes.',
  tools: [howManyJokes],
});

async function main() {
  const result = await Runner.runStreamed(agent, 'Hello. tell me jokes');

  for await (const event of result.streamEvents()) {
    if (event.type === 'raw_response_event') {
      continue;
    } else if (event.type === 'agent_updated_stream_event') {
      console.log(`Agent updated: ${event.newAgent.name}`);
      continue;
    } else if (event.type === 'run_item_stream_event') {
      if (event.item.type === 'tool_call_item') {
        console.log('-- Tool was called');
      } else if (event.item.type === 'tool_call_output_item') {
        console.log(`-- Tool output: ${event.item.output}`);
      } else if (event.item.type === 'message_output_item') {
        console.log(
          `-- Message output:\n ${ItemHelpers.textMessageOutput(event.item)}`
        );
      }
    }

    // ONLY PRINT OUTPUT AS STREAM (same as stream-text.ts)
    // if (event.type === 'agent_text_delta_stream_event') {
    //   process.stdout.write(event.delta);
    // }
  }
}

main();
