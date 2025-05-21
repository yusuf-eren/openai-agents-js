# Quickstart

## Create a project

You'll only need to do this once.

```bash
mkdir my_project
cd my_project
npm init -y
```

### Install the Agents SDK

```bash
npm install openai-agents-js
```

### Set an OpenAI API key

If you don't have one, follow [these instructions](https://platform.openai.com/docs/quickstart#create-and-export-an-api-key) to create an OpenAI API key.

```bash
export OPENAI_API_KEY=sk-...
```

## Create your first agent

Agents are defined with instructions, a name, and optional config (such as `modelConfig`)

```typescript
import { Agent } from 'openai-agents-js';

const agent = new Agent({
  name: "Math Tutor",
  instructions: "You provide help with math problems. Explain your reasoning at each step and include examples",
});
```

## Add a few more agents

Additional agents can be defined in the same way. `handoff_description` provides additional context for determining handoff routing

```typescript
import { Agent } from 'openai-agents-js';

const historyTutorAgent = new Agent({
  name: "History Tutor",
  handoff_description: "Specialist agent for historical questions",
  instructions: "You provide assistance with historical queries. Explain important events and context clearly.",
});

const mathTutorAgent = new Agent({
  name: "Math Tutor",
  handoff_description: "Specialist agent for math questions",
  instructions: "You provide help with math problems. Explain your reasoning at each step and include examples",
});
```

## Define your handoffs

On each agent, you can define an inventory of outgoing handoff options that the agent can choose from to decide how to make progress on their task.

```typescript
const triageAgent = new Agent({
  name: "Triage Agent",
  instructions: "You determine which agent to use based on the user's homework question",
  handoffs: [historyTutorAgent, mathTutorAgent]
});
```

## Run the agent orchestration

Let's check that the workflow runs and the triage agent correctly routes between the two specialist agents.

```typescript
import { Runner } from 'openai-agents-js';

async function main() {
  const result = await Runner.run(triageAgent, "What is the capital of France?");
  console.log(result.finalOutput);
}

main();
```

## Add a guardrail

You can define custom guardrails to run on the input or output.

```typescript
import { z } from 'zod';
import { 
  Agent, 
  Runner, 
  GuardrailFunctionOutput, 
  AgentOutputSchema,
  RunContextWrapper,
  TResponseInputItem 
} from 'openai-agents-js';

const HomeworkOutputSchema = z.object({
  isHomework: z.boolean(),
  reasoning: z.string(),
});

const guardrailAgent = new Agent({
  name: "Guardrail check",
  instructions: "Check if the user is asking about homework.",
  output_type: new AgentOutputSchema(HomeworkOutputSchema),
});

async function homeworkGuardrail(
  ctx: RunContextWrapper<any>, 
  agent: Agent<any>, 
  input: string | TResponseInputItem[]
) {
  const result = await Runner.run(guardrailAgent, input, { context: ctx.context });
  const finalOutput = result.finalOutputAs(HomeworkOutputSchema);
  console.log(finalOutput);
  return new GuardrailFunctionOutput({
    output_info: finalOutput,
    tripwire_triggered: !finalOutput.isHomework,
  });
}
```

## Put it all together

Let's put it all together and run the entire workflow, using handoffs and the input guardrail.

```typescript
import { z } from 'zod';
import { 
  Agent, 
  Runner, 
  GuardrailFunctionOutput, 
  AgentOutputSchema,
  InputGuardrail,
  RunContextWrapper,
  TResponseInputItem 
} from 'openai-agents-js';

const HomeworkOutputSchema = z.object({
  isHomework: z.boolean(),
  reasoning: z.string(),
});

const guardrailAgent = new Agent({
  name: "Guardrail check",
  instructions: "Check if the user is asking about homework.",
  output_type: new AgentOutputSchema(HomeworkOutputSchema),
});

const mathTutorAgent = new Agent({
  name: "Math Tutor",
  handoff_description: "Specialist agent for math questions",
  instructions: "You provide help with math problems. Explain your reasoning at each step and include examples",
});

const historyTutorAgent = new Agent({
  name: "History Tutor",
  handoff_description: "Specialist agent for historical questions",
  instructions: "You provide assistance with historical queries. Explain important events and context clearly.",
});

async function homeworkGuardrail(
  ctx: RunContextWrapper<any>, 
  agent: Agent<any>, 
  input: string | TResponseInputItem[]
) {
  const result = await Runner.run(guardrailAgent, input, { context: ctx.context });
  const finalOutput = result.finalOutputAs(HomeworkOutputSchema);
  console.log(finalOutput);
  return new GuardrailFunctionOutput({
    output_info: finalOutput,
    tripwire_triggered: !finalOutput.isHomework,
  });
}

const triageAgent = new Agent({
  name: "Triage Agent",
  instructions: "You determine which agent to use based on the user's homework question",
  handoffs: [historyTutorAgent, mathTutorAgent],
  input_guardrails: [new InputGuardrail(homeworkGuardrail)],
});

async function main() {
  const result1 = await Runner.run(triageAgent, "who was the first president of the united states?");
  console.log(result1.finalOutput);

  const result2 = await Runner.run(triageAgent, "what is life");
  console.log(result2.finalOutput);
}

main();
```

## View your traces

To review what happened during your agent run, navigate to the [Trace viewer in the OpenAI Dashboard](https://platform.openai.com/traces) to view traces of your agent runs.

## Next steps

Learn how to build more complex agentic flows:

-   Learn about how to configure [Agents](agents.md).
-   Learn about [running agents](running_agents.md).
-   Learn about [tools](tools.md), [guardrails](guardrails.md) and [models](models/index.md). 