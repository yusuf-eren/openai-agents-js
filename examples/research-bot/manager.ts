import { Runner } from '../../src/agents/run';
import { genTraceId } from '../../src/agents/tracing';
import { WebSearch, WebSearchPlan } from './agents/planner-agent';
import { ReportData } from './agents/writer-agent';
import { Printer } from './printer';
import { plannerAgent, searchAgent, writerAgent } from './agents';

export class ResearchManager {
  private printer: Printer;

  constructor() {
    this.printer = new Printer();
  }

  async run(query: string): Promise<void> {
    const traceId = genTraceId();

    this.printer.updateItem(
      'trace_id',
      `View trace: https://platform.openai.com/traces/trace?trace_id=${traceId}`,
      true,
      true
    );

    this.printer.updateItem('starting', 'Starting research...', true, true);

    const searchPlan = await this.planSearches(query);
    const searchResults = await this.performSearches(searchPlan);
    const report = await this.writeReport(query, searchResults);

    const finalReport = `Report summary\n\n${report.short_summary}`;
    this.printer.updateItem('final_report', finalReport, true);

    this.printer.end();

    console.log('\n\n=====REPORT=====\n\n');
    console.log(`Report: ${report.markdown_report}`);
    console.log('\n\n=====FOLLOW UP QUESTIONS=====\n\n');
    const followUpQuestions = report.follow_up_questions.join('\n');
    console.log(`Follow up questions: ${followUpQuestions}`);
  }

  private async planSearches(query: string): Promise<WebSearchPlan> {
    this.printer.updateItem('planning', 'Planning searches...');
    const result = await Runner.run(plannerAgent, `Query: ${query}`);
    console.log('-------PIZDASDAS', result.finalOutput, '\n---------');
    this.printer.updateItem(
      'planning',
      `Will perform ${result.finalOutput.searches.length} searches`,
      true
    );
    return result.finalOutput as WebSearchPlan;
  }

  private async performSearches(searchPlan: WebSearchPlan): Promise<string[]> {
    this.printer.updateItem('searching', 'Searching...');
    let numCompleted = 0;
    const tasks = searchPlan.searches.map((item) => this.search(item));
    const results: string[] = [];

    for await (const result of tasks) {
      if (result) {
        results.push(result);
      }
      numCompleted++;
      this.printer.updateItem(
        'searching',
        `Searching... ${numCompleted}/${tasks.length} completed`
      );
    }

    this.printer.markItemDone('searching');
    return results;
  }

  private async search(item: WebSearch): Promise<string | null> {
    const input = `Search term: ${item.query}\nReason for searching: ${item.reason}`;
    try {
      const result = await Runner.run(searchAgent, input);
      return String(result.finalOutput);
    } catch (error) {
      return null;
    }
  }

  private async writeReport(
    query: string,
    searchResults: string[]
  ): Promise<ReportData> {
    this.printer.updateItem('writing', 'Thinking about report...');
    const input = `Original query: ${query}\nSummarized search results: ${searchResults}`;
    const result = Runner.runStreamed(writerAgent, input);

    const updateMessages = [
      'Thinking about report...',
      'Planning report structure...',
      'Writing outline...',
      'Creating sections...',
      'Cleaning up formatting...',
      'Finalizing report...',
      'Finishing report...',
    ];

    let lastUpdate = Date.now();
    let nextMessage = 0;

    for await (const _ of result.streamEvents()) {
      if (
        Date.now() - lastUpdate > 5000 &&
        nextMessage < updateMessages.length
      ) {
        this.printer.updateItem('writing', updateMessages[nextMessage]);
        nextMessage++;
        lastUpdate = Date.now();
      }
    }

    this.printer.markItemDone('writing');
    return result.finalOutput as ReportData;
  }
}
