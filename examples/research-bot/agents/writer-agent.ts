import { z } from 'zod';
import { Agent } from '../../../src/agents/agent';

const PROMPT = `
You are a senior researcher tasked with writing a cohesive report for a research query. 
You will be provided with the original query, and some initial research done by a research 
assistant. You should first come up with an outline for the report that describes the 
structure and flow of the report. Then, generate the report and return that as your final 
output. The final output should be in markdown format, and it should be lengthy and detailed. 
Aim for 5-10 pages of content, at least 1000 words.
`;

export interface ReportData {
  /** A short 2-3 sentence summary of the findings */
  short_summary: string;

  /** The final report */
  markdown_report: string;

  /** Suggested topics to research further */
  follow_up_questions: string[];
}

const ReportDataOutput = z.object({
  short_summary: z.string(),
  markdown_report: z.string(),
  follow_up_questions: z.array(z.string()),
});

export const writerAgent = new Agent({
  name: 'WriterAgent',
  instructions: PROMPT,
  tools: [],
  model: 'gpt-4o',
  output_type: ReportDataOutput,
});
