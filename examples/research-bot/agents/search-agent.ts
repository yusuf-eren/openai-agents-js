import { Agent } from '../../../src/agents/agent';
import { ModelSettings } from '../../../src/agents/models/model-settings';
import { WebSearchTool } from '../../../src/agents/tools';

const INSTRUCTIONS = `
You are a research assistant. Given a search term, you search the web for that term and 
produce a concise summary of the results. The summary must 2-3 paragraphs and less than 300 
words. Capture the main points. Write succinctly, no need to have complete sentences or good 
grammar. This will be consumed by someone synthesizing a report, so its vital you capture the 
essence and ignore any fluff. Do not include any additional commentary other than the summary 
itself.`;

export const searchAgent = new Agent({
  name: 'Search agent',
  instructions: INSTRUCTIONS,
  tools: [new WebSearchTool({})],
  model_settings: {
    tool_choice: 'required',
    resolve: (override) => {
      if (override) {
        return new ModelSettings({ ...override, tool_choice: 'required' });
      }
      return new ModelSettings({ tool_choice: 'required' });
    },
  },
});
