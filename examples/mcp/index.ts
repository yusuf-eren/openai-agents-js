import { Agent } from '../../src/agents/agent';
import { MCPServerStdio } from '../../src/agents/mcp';
import { Runner } from '../../src/agents/run';
import path from 'path';

async function main() {
    const currentFileDir = path.dirname(process.argv[1]);

    const mcp = [
        new MCPServerStdio('npx', [
            '-y',
            '@modelcontextprotocol/server-filesystem',
            currentFileDir
        ])
    ];
    const agent = new Agent({
        name: 'Assistant',
        instructions: `Use the tools to read the filesystem and answer questions based on those files.`,
        mcp_servers: mcp
    });

    console.log('Running: Read the files and list them.');
    const result = await Runner.run(agent, 'Read the files and list them.');
    console.log(result.finalOutput);

    console.log('Running: What is my #1 favorite book?');
    const result2 = await Runner.run(agent, 'What is my #1 favorite book?');
    console.log(result2.finalOutput);

    console.log(
        'Running: Look at my favorite songs. Suggest one new song that I might like.'
    );
    const result3 = await Runner.run(
        agent,
        'Look at my favorite songs. Suggest one new song that I might like.'
    );
    console.log(result3.finalOutput);
}

main();
