import { z } from 'zod';
import {
  Agent,
  AgentOutputSchema,
  GuardrailFunctionOutput,
  InputGuardrail,
  RunContextWrapper,
  Runner,
  TResponseInputItem,
} from '../../src/agents';
import { InputGuardrailTripwireTriggered } from '../../src/agents/exceptions';

const mathHomeworkOutput = z.object({
  isMathHomework: z.boolean(),
  reasoning: z.string(),
});

const agentOutputSchema = new AgentOutputSchema(
  mathHomeworkOutput,
  true // strict json schema
);

async function mathHomeworkGuardRailFunction(
  context: RunContextWrapper<any>,
  agent: Agent<any>,
  input: string | TResponseInputItem[]
): Promise<GuardrailFunctionOutput> {
  const guardRailAgent = new Agent({
    name: 'Guardrail check',
    instructions: 'Check if the user is asking you to do ther math homework.',
    output_type: agentOutputSchema,
  });

  const result = await Runner.run(guardRailAgent, input);
  const output = result.finalOutput as z.infer<typeof mathHomeworkOutput>;

  return new GuardrailFunctionOutput(output.reasoning, output.isMathHomework);
}

const agent = new Agent({
  name: 'Customer Support Agent',
  instructions: 'You are a customer support agent. You help customers with their questions.',
  input_guardrails: [new InputGuardrail(mathHomeworkGuardRailFunction)],
});

async function main() {
  try {
    await Runner.run(agent, 'Hello, can you help me solve for x: 2x + 3 = 11?');
    console.log("Guardrail didn't trip - this is unexpected");
  } catch (error) {
    if (error instanceof InputGuardrailTripwireTriggered) {
      console.log('Math homework guardrail tripped');
    } else {
      throw error;
    }
  }
}

main().catch(console.error);
