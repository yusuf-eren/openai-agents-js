import { config } from 'dotenv';
import OpenAI from 'openai';

config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function main() {
  const response = await openai.responses.create({
    model: 'gpt-4o',
    input: [
      {
        role: 'system',
        content: [
          {
            type: 'input_text',
            text: "You are a research assistant. Given a search term, you search the web for that term and \\n' +\n        'produce a concise summary of the results. The summary must 2-3 paragraphs and less than 300 \\n' +\n        'words. Capture the main points. Write succinctly, no need to have complete sentences or good \\n' +\n        'grammar. This will be consumed by someone synthesizing a report, so its vital you capture the \\n' +\n        'essence and ignore any fluff. Do not include any additional commentary other than the summary \\n' +\n        'itself.'",
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'input_text',
            text: 'current lunar habitation projects and plans for moon bases',
          },
        ],
      },
    ],
    text: {
      format: {
        type: 'text',
      },
    },
    reasoning: {},
    tools: [
      {
        type: 'web_search_preview',
        user_location: {
          type: 'approximate',
        },
        search_context_size: 'medium',
      },
    ],
    temperature: 1,
    max_output_tokens: 2048,
    top_p: 1,
    store: true,
  });
}

main();
