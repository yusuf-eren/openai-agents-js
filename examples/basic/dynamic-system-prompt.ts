import { Agent, RunContextWrapper, Runner } from '../../src/agents';

type StyleType = 'haiku' | 'pirate' | 'robot';

class CustomContext {
  constructor(public style: StyleType) {}
}

function customInstructions(
  runContext: RunContextWrapper<CustomContext>,
  agent: Agent<CustomContext>
): string {
  const context = runContext.context;
  if (context.style === 'haiku') {
    return 'Only respond in haikus.';
  } else if (context.style === 'pirate') {
    return 'Respond as a pirate.';
  } else {
    return "Respond as a robot and say 'beep boop' a lot.";
  }
}

const agent = new Agent({
  name: 'Chat agent',
  instructions: customInstructions,
  tools: [],
});

async function main() {
  const styles: StyleType[] = ['haiku', 'pirate', 'robot'];
  const choice = styles[Math.floor(Math.random() * styles.length)];
  const context = new CustomContext(choice);
  console.log(`Using style: ${choice}\n`);

  const userMessage = 'Tell me a joke.';
  console.log(`User: ${userMessage}`);
  const result = await Runner.run(agent, userMessage, {
    context: context,
  });

  console.log(`Assistant: ${result.finalOutput}`);
}

main().catch(console.error);
