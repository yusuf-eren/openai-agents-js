import { Agent, Runner } from '../../src/agents';

async function main() {
  const agent = new Agent({
    name: 'Joker',
    instructions: 'You are a helpful assistant.',
    tools: [],
  });

  const result = await Runner.runStreamed(agent, 'Please tell me 5 jokes.');
  for await (const event of result.streamEvents()) {
    if (event.type === 'raw_response_event' && event.data.type === 'response.output_text.delta') {
      process.stdout.write(event.data.delta);
    }
  }
}

main().catch(console.error);
