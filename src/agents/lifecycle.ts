import { Agent } from './agent';
import { RunContextWrapper } from './run-context';
import { Tool } from './tools';

/**
 * A class that receives callbacks on various lifecycle events in an agent run. Subclass and
 * override the methods you need.
 */
export class RunHooks<TContext> {
  /**
   * Called before the agent is invoked. Called each time the current agent changes.
   */
  async onAgentStart(
    context: RunContextWrapper<TContext>,
    agent: Agent<TContext>
  ): Promise<void> {
    // Default implementation does nothing
  }

  /**
   * Called when the agent produces a final output.
   */
  async onAgentEnd(
    context: RunContextWrapper<TContext>,
    agent: Agent<TContext>,
    output: any
  ): Promise<void> {
    // Default implementation does nothing
  }

  /**
   * Called when a handoff occurs.
   */
  async onHandoff(
    context: RunContextWrapper<TContext>,
    fromAgent: Agent<TContext>,
    toAgent: Agent<TContext>
  ): Promise<void> {
    // Default implementation does nothing
  }

  /**
   * Called before a tool is invoked.
   */
  async onToolStart(
    context: RunContextWrapper<TContext>,
    agent: Agent<TContext>,
    tool: Tool
  ): Promise<void> {
    // Default implementation does nothing
  }

  /**
   * Called after a tool is invoked.
   */
  async onToolEnd(
    context: RunContextWrapper<TContext>,
    agent: Agent<TContext>,
    tool: Tool,
    result: string
  ): Promise<void> {
    // Default implementation does nothing
  }
}

/**
 * A class that receives callbacks on various lifecycle events for a specific agent. You can
 * set this on `agent.hooks` to receive events for that specific agent.
 *
 * Subclass and override the methods you need.
 */
export class AgentHooks<TContext> {
  /**
   * Called before the agent is invoked. Called each time the running agent is changed to this
   * agent.
   */
  async onStart(
    context: RunContextWrapper<TContext>,
    agent: Agent<TContext>
  ): Promise<void> {
    // Default implementation does nothing
  }

  /**
   * Called when the agent produces a final output.
   */
  async onEnd(
    context: RunContextWrapper<TContext>,
    agent: Agent<TContext>,
    output: any
  ): Promise<void> {
    // Default implementation does nothing
  }

  /**
   * Called when the agent is being handed off to. The `source` is the agent that is handing
   * off to this agent.
   */
  async onHandoff(
    context: RunContextWrapper<TContext>,
    agent: Agent<TContext>,
    source: Agent<TContext>
  ): Promise<void> {
    // Default implementation does nothing
  }

  /**
   * Called before a tool is invoked.
   */
  async onToolStart(
    context: RunContextWrapper<TContext>,
    agent: Agent<TContext>,
    tool: Tool
  ): Promise<void> {
    // Default implementation does nothing
  }

  /**
   * Called after a tool is invoked.
   */
  async onToolEnd(
    context: RunContextWrapper<TContext>,
    agent: Agent<TContext>,
    tool: Tool,
    result: string
  ): Promise<void> {
    // Default implementation does nothing
  }
}
