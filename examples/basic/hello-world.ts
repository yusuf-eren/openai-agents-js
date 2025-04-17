import { Agent } from '../../src/agents';
import { Runner } from '../../src/agents/run';

async function main() {
  const agent = new Agent({
    name: 'Assistant',
    instructions: 'You only respond in haikus.',
    tools: [],
  });

  const result = await Runner.run(
    agent,
    'Tell me about recursion in programming.'
  );
  console.log(result.finalOutput);
  // Function calls itself,
  // Looping in smaller pieces,
  // Endless by design.
}

main();
