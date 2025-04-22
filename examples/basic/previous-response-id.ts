import { Agent, Runner } from '../../src/agents';

/**
 * This demonstrates usage of the `previous_response_id` parameter to continue a conversation.
 * The second run passes the previous response ID to the model, which allows it to continue the
 * conversation without re-sending the previous messages.
 *
 * Notes:
 * 1. This only applies to the OpenAI Responses API. Other models will ignore this parameter.
 * 2. Responses are only stored for 30 days as of this writing, so in production you should
 *    store the response ID along with an expiration date; if the response is no longer valid,
 *    you'll need to re-send the previous conversation history.
 */

async function main() {
  const agent = new Agent({
    name: 'Assistant',
    instructions: 'You are a helpful assistant. be VERY concise.',
  });

  const result = await Runner.run(
    agent,
    'What is the largest country in South America?'
  );
  console.log(result.finalOutput);
  // Brazil
  console.log('first message response_id:', result.lastResponseId);

  const followupResult = await Runner.run(
    agent,
    'What is the capital of that country?',
    { previousResponseId: result.lastResponseId! }
  );
  console.log(followupResult.finalOutput);
  // Brasilia
  console.log('second message response_id:', followupResult.lastResponseId);
}

async function mainStream() {
  const agent = new Agent({
    name: 'Assistant',
    instructions: 'You are a helpful assistant. be VERY concise.',
    tools: [],
  });

  const result = Runner.runStreamed(
    agent,
    'What is the largest country in South America?'
  );

  for await (const event of result.streamEvents()) {
    if (
      event.type === 'raw_response_event' &&
      event.data.type === 'response.output_text.delta'
    ) {
      process.stdout.write(event.data.delta);
    }
  }
  console.log('\n---');

  console.log('first messageresponse_id:', result.lastResponseId);

  const followupResult = Runner.runStreamed(
    agent,
    'What is the capital of that country?',
    { previousResponseId: result.lastResponseId! }
  );

  for await (const event of followupResult.streamEvents()) {
    if (
      event.type === 'raw_response_event' &&
      event.data.type === 'response.output_text.delta'
    ) {
      process.stdout.write(event.data.delta);
    }
  }

  console.log('\n---');
  console.log('second message response_id:', followupResult.lastResponseId);
}

// Get user input for stream mode
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
});

readline.question('Run in stream mode? (y/n): ', (answer: string) => {
  readline.close();
  if (answer.toLowerCase() === 'y') {
    mainStream();
  } else {
    main();
  }
});
