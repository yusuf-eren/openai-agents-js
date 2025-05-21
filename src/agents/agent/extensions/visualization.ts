import { Agent } from '../../agent';
import { Handoff } from '../../handoffs';
import graphviz from 'graphviz';

/**
 * Draw a graph of the agent's structure using graphviz.
 * Note: Requires graphviz to be installed via homebrew:
 * brew install graphviz
 * 
 * @param agent The agent to draw.
 * @param filename The filename to save the graph to.
 */
export function drawGraph(agent: Agent<any>, filename?: string): void {
  const g = graphviz.digraph('G');

  g.set('splines', 'true');
  g.setNodeAttribut('fontname', 'Arial');
  g.setEdgeAttribut('penwidth', '1.5');

  g.addNode('__start__', {
    label: '__start__',
    shape: 'ellipse',
    style: 'filled',
    fillcolor: 'lightblue',
    width: '0.5',
    height: '0.3',
  });

  g.addNode('__end__', {
    label: '__end__',
    shape: 'ellipse',
    style: 'filled',
    fillcolor: 'lightblue',
    width: '0.5',
    height: '0.3',
  });

  g.addNode(agent.name, {
    label: agent.name,
    shape: 'box',
    style: 'filled',
    fillcolor: 'lightyellow',
    width: '1.5',
    height: '0.8',
  });

  for (const tool of agent.tools ?? []) {
    g.addNode(tool.name, {
      label: tool.name,
      shape: 'ellipse',
      style: 'filled',
      fillcolor: 'lightgreen',
      width: '0.5',
      height: '0.3',
    });

    g.addEdge(agent.name, tool.name, { style: 'dotted', penwidth: '1.5' });
    g.addEdge(tool.name, agent.name, { style: 'dotted', penwidth: '1.5' });
  }

  for (const handoff of agent.handoffs ?? []) {
    if (handoff instanceof Handoff) {
      g.addNode(handoff.agentName, {
        label: handoff.agentName,
        shape: 'box',
        style: 'filled,rounded',
        fillcolor: 'lightyellow',
        width: '1.5',
        height: '0.8',
      });

      g.addEdge(agent.name, handoff.agentName);
    } else if ('name' in handoff) {
      g.addNode(handoff.name, {
        label: handoff.name,
        shape: 'box',
        style: 'filled,rounded',
        fillcolor: 'lightyellow',
        width: '1.5',
        height: '0.8',
      });

      g.addEdge(agent.name, handoff.name);
      addNested(g, handoff);
    }
  }

  if ((agent.handoffs?.length ?? 0) === 0) {
    g.addEdge(agent.name, '__end__');
  } else {
    g.addEdge('__start__', agent.name);
  }

  if (filename) {
    g.output('png', filename + '.png');
  }
}

function addNested(g: graphviz.Graph, agent: Agent<any>): void {
  for (const tool of agent.tools ?? []) {
    g.addNode(tool.name, {
      label: tool.name,
      shape: 'ellipse',
      style: 'filled',
      fillcolor: 'lightgreen',
      width: '0.5',
      height: '0.3',
    });

    g.addEdge(agent.name, tool.name, { style: 'dotted', penwidth: '1.5' });
    g.addEdge(tool.name, agent.name, { style: 'dotted', penwidth: '1.5' });
  }

  for (const handoff of agent.handoffs ?? []) {
    if (handoff instanceof Handoff) {
      g.addNode(handoff.agentName, {
        label: handoff.agentName,
        shape: 'box',
        style: 'filled,rounded',
        fillcolor: 'lightyellow',
        width: '1.5',
        height: '0.8',
      });

      g.addEdge(agent.name, handoff.agentName);
    } else if ('name' in handoff) {
      g.addNode(handoff.name, {
        label: handoff.name,
        shape: 'box',
        style: 'filled,rounded',
        fillcolor: 'lightyellow',
        width: '1.5',
        height: '0.8',
      });

      g.addEdge(agent.name, handoff.name);
      addNested(g, handoff);
    }
  }

  if ((agent.handoffs?.length ?? 0) === 0) {
    g.addEdge(agent.name, '__end__');
  }
}
