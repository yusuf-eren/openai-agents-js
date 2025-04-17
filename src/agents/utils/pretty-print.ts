import { RunResult, RunResultBase, RunResultStreaming } from '../result';

/**
 * Indents each line of a string by the specified level
 *
 * @param text The text to indent
 * @param indentLevel The number of indentation levels
 * @returns The indented text
 */
function indent(text: string, indentLevel: number): string {
  const indentString = '  '.repeat(indentLevel);
  return text
    .split('\n')
    .map((line) => `${indentString}${line}`)
    .join('\n');
}

/**
 * Returns a string representation of the final output
 *
 * @param result The run result containing the final output
 * @returns A string representation of the final output
 */
function finalOutputStr(result: RunResultBase): string {
  if (result.finalOutput === null || result.finalOutput === undefined) {
    return 'null';
  } else if (typeof result.finalOutput === 'string') {
    return result.finalOutput;
  } else if (
    typeof result.finalOutput === 'object' &&
    'toJSON' in result.finalOutput &&
    typeof result.finalOutput.toJSON === 'function'
  ) {
    return JSON.stringify(result.finalOutput.toJSON(), null, 2);
  } else {
    return String(result.finalOutput);
  }
}

/**
 * Formats a RunResult object as a human-readable string
 *
 * @param result The RunResult to format
 * @returns A formatted string representation of the RunResult
 */
export function prettyPrintResult(result: RunResult): string {
  let output = 'RunResult:';
  output += `\n- Last agent: Agent(name="${result.lastAgent.name}", ...)`;
  output +=
    `\n- Final output (${
      result.finalOutput ? result.finalOutput.constructor.name : 'null'
    }):\n` + `${indent(finalOutputStr(result), 2)}`;
  output += `\n- ${result.newItems.length} new item(s)`;
  output += `\n- ${result.rawResponses.length} raw response(s)`;
  output += `\n- ${result.inputGuardrailResults.length} input guardrail result(s)`;
  output += `\n- ${result.outputGuardrailResults.length} output guardrail result(s)`;
  output += '\n(See `RunResult` for more details)';

  return output;
}

/**
 * Formats a RunResultStreaming object as a human-readable string
 *
 * @param result The RunResultStreaming to format
 * @returns A formatted string representation of the RunResultStreaming
 */
export function prettyPrintRunResultStreaming(
  result: RunResultStreaming
): string {
  let output = 'RunResultStreaming:';
  output += `\n- Current agent: Agent(name="${result.currentAgent.name}", ...)`;
  output += `\n- Current turn: ${result.currentTurn}`;
  output += `\n- Max turns: ${result.maxTurns}`;
  output += `\n- Is complete: ${result.isComplete}`;
  output +=
    `\n- Final output (${
      result.finalOutput ? result.finalOutput.constructor.name : 'null'
    }):\n` + `${indent(finalOutputStr(result), 2)}`;
  output += `\n- ${result.newItems.length} new item(s)`;
  output += `\n- ${result.rawResponses.length} raw response(s)`;
  output += `\n- ${result.inputGuardrailResults.length} input guardrail result(s)`;
  output += `\n- ${result.outputGuardrailResults.length} output guardrail result(s)`;
  output += '\n(See `RunResultStreaming` for more details)';

  return output;
}
