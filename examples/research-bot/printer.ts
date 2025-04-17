export class Printer {
  private items: Map<string, [string, boolean]>;
  private hideDoneIds: Set<string>;
  private lastRender: string = '';

  constructor() {
    this.items = new Map();
    this.hideDoneIds = new Set();
  }

  end(): void {
    // Clear the last line and print final state
    this.flush();
    process.stdout.write('\n');
  }

  hideDoneCheckmark(itemId: string): void {
    this.hideDoneIds.add(itemId);
  }

  updateItem(
    itemId: string,
    content: string,
    isDone: boolean = false,
    hideCheckmark: boolean = false
  ): void {
    this.items.set(itemId, [content, isDone]);
    if (hideCheckmark) {
      this.hideDoneIds.add(itemId);
    }
    this.flush();
  }

  markItemDone(itemId: string): void {
    const item = this.items.get(itemId);
    if (item) {
      this.items.set(itemId, [item[0], true]);
    }
    this.flush();
  }

  private flush(): void {
    const lines: string[] = [];

    for (const [itemId, [content, isDone]] of this.items) {
      if (isDone) {
        const prefix = this.hideDoneIds.has(itemId) ? '' : '✓ ';
        lines.push(prefix + content);
      } else {
        // Simple spinner animation using dots
        lines.push(`... ${content}`);
      }
    }

    // Clear previous output
    if (this.lastRender) {
      const numLines = this.lastRender.split('\n').length;
      for (let i = 0; i < numLines; i++) {
        process.stdout.write('\x1b[2K'); // Clear line
        process.stdout.write('\x1b[1A'); // Move up one line
      }
      process.stdout.write('\x1b[2K'); // Clear the last line
    }

    // Render new output
    const output = lines.join('\n');
    process.stdout.write(output);
    this.lastRender = output;
  }
}
