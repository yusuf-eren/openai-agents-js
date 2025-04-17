import { ResearchManager } from "./manager";

async function main() {
  const manager = new ResearchManager();
  await manager.run('Caribbean vacation spots in April, optimizing for surfing, hiking and water sports');
}

main();
