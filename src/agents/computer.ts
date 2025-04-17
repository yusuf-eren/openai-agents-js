/**
 * The environment type for the computer
 */
export type Environment = 'mac' | 'windows' | 'ubuntu' | 'browser';

/**
 * The button type for mouse clicks
 */
export type Button = 'left' | 'right' | 'wheel' | 'back' | 'forward';

/**
 * A computer implemented with sync operations. The Computer interface abstracts the
 * operations needed to control a computer or browser.
 */
export abstract class Computer {
  /**
   * The environment this computer is running in
   */
  abstract get environment(): Environment;

  /**
   * The dimensions of the screen
   */
  abstract get dimensions(): [number, number];

  /**
   * Take a screenshot of the current screen
   */
  abstract screenshot(): string;

  /**
   * Click at the specified coordinates with the specified button
   */
  abstract click(x: number, y: number, button: Button): void;

  /**
   * Double click at the specified coordinates
   */
  abstract doubleClick(x: number, y: number): void;

  /**
   * Scroll at the specified coordinates
   */
  abstract scroll(x: number, y: number, scrollX: number, scrollY: number): void;

  /**
   * Type the specified text
   */
  abstract type(text: string): void;

  /**
   * Wait for a moment
   */
  abstract wait(): void;

  /**
   * Move the mouse to the specified coordinates
   */
  abstract move(x: number, y: number): void;

  /**
   * Press the specified keys
   */
  abstract keypress(keys: string[]): void;

  /**
   * Drag the mouse along the specified path
   */
  abstract drag(path: [number, number][]): void;
}

/**
 * A computer implemented with async operations. The Computer interface abstracts the
 * operations needed to control a computer or browser.
 */
export abstract class AsyncComputer {
  /**
   * The environment this computer is running in
   */
  abstract get environment(): Environment;

  /**
   * The dimensions of the screen
   */
  abstract get dimensions(): [number, number];

  /**
   * Take a screenshot of the current screen
   */
  abstract screenshot(): Promise<string>;

  /**
   * Click at the specified coordinates with the specified button
   */
  abstract click(x: number, y: number, button: Button): Promise<void>;

  /**
   * Double click at the specified coordinates
   */
  abstract doubleClick(x: number, y: number): Promise<void>;

  /**
   * Scroll at the specified coordinates
   */
  abstract scroll(
    x: number,
    y: number,
    scrollX: number,
    scrollY: number
  ): Promise<void>;

  /**
   * Type the specified text
   */
  abstract type(text: string): Promise<void>;

  /**
   * Wait for a moment
   */
  abstract wait(): Promise<void>;

  /**
   * Move the mouse to the specified coordinates
   */
  abstract move(x: number, y: number): Promise<void>;

  /**
   * Press the specified keys
   */
  abstract keypress(keys: string[]): Promise<void>;

  /**
   * Drag the mouse along the specified path
   */
  abstract drag(path: [number, number][]): Promise<void>;
}
