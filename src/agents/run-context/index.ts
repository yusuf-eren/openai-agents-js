import { Usage } from '../usage';

// Define TContext TypeVar equivalent in TypeScript
type TContext<T = any> = T;

/**
 * This wraps the context object that you passed to `Runner.run()`. It also contains
 * information about the usage of the agent run so far.
 *
 * NOTE: Contexts are not passed to the LLM. They're a way to pass dependencies and data to code
 * you implement, like tool functions, callbacks, hooks, etc.
 */
export class RunContextWrapper<T = any> {
  /**
   * The context object (or None), passed by you to `Runner.run()`
   */
  context: T;

  /**
   * The usage of the agent run so far. For streamed responses, the usage will be stale until the
   * last chunk of the stream is processed.
   */
  usage: Usage;

  constructor(context: T, usage?: Usage) {
    this.context = context;
    this.usage = usage || new Usage();
  }
}
