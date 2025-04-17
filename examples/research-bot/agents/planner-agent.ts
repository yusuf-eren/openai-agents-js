import { z } from 'zod';
import { Agent } from '../../../src/agents/agent';

const PROMPT = `
 You are a helpful research assistant. Given a query, come up with a set of web searches
 to perform to best answer the query. Output between 5 and 20 terms to query for.
`;

const WebSearchPlanOutput = z.object({
  searches: z.array(
    z.object({
      reason: z.string(),
      query: z.string(),
    })
  ),
});

export interface WebSearch {
  reason: string;
  query: string;
}

export interface WebSearchPlan {
  searches: WebSearch[];
}

export const plannerAgent = new Agent({
  name: 'PlannerAgent',
  model: 'gpt-4o',
  tools: [],
  instructions: PROMPT,
  output_type: WebSearchPlanOutput,
});
