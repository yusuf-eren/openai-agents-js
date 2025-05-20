import { Agent, Runner } from '../../src/agents';

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
