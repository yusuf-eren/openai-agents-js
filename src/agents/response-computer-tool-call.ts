/**
 * Types for computer tool calls and actions
 */

/**
 * Action for clicking with a mouse button
 */
export interface ActionClick {
  /**
   * Indicates which mouse button was pressed during the click.
   * One of `left`, `right`, `wheel`, `back`, or `forward`.
   */
  button: 'left' | 'right' | 'wheel' | 'back' | 'forward';

  /**
   * Specifies the event type.
   * For a click action, this property is always set to `click`.
   */
  type: 'click';

  /**
   * The coordinates where the click occurred
   */
  coordinates: {
    /**
     * The x-coordinate where the click occurred.
     */
    x: number;

    /**
     * The y-coordinate where the click occurred.
     */
    y: number;
  };
}

/**
 * Action for double-clicking
 */
export interface ActionDoubleClick {
  /**
   * Specifies the event type.
   * For a double click action, this property is always set to `double_click`.
   */
  type: 'double_click';

  /**
   * The coordinates where the double click occurred
   */
  coordinates: {
    /**
     * The x-coordinate where the double click occurred.
     */
    x: number;

    /**
     * The y-coordinate where the double click occurred.
     */
    y: number;
  };
}

/**
 * Path point for drag actions
 */
export interface ActionDragPath {
  /**
   * The x-coordinate.
   */
  x: number;

  /**
   * The y-coordinate.
   */
  y: number;
}

/**
 * Action for dragging the cursor
 */
export interface ActionDrag {
  /**
   * An array of coordinates representing the path of the drag action.
   *
   * Example:
   * ```
   * [
   *   { x: 100, y: 200 },
   *   { x: 200, y: 300 }
   * ]
   * ```
   */
  path: ActionDragPath[];

  /**
   * Specifies the event type.
   * For a drag action, this property is always set to `drag`.
   */
  type: 'drag';
}

/**
 * Action for pressing keys
 */
export interface ActionKeypress {
  /**
   * The combination of keys the model is requesting to be pressed.
   * This is an array of strings, each representing a key.
   */
  keys: string[];

  /**
   * Specifies the event type.
   * For a keypress action, this property is always set to `keypress`.
   */
  type: 'keypress';
}

/**
 * Action for moving the cursor
 */
export interface ActionMove {
  /**
   * Specifies the event type.
   * For a move action, this property is always set to `move`.
   */
  type: 'move';

  /**
   * The coordinates to move to
   */
  coordinates: {
    /**
     * The x-coordinate to move to.
     */
    x: number;

    /**
     * The y-coordinate to move to.
     */
    y: number;
  };
}

/**
 * Action for taking a screenshot
 */
export interface ActionScreenshot {
  /**
   * Specifies the event type.
   * For a screenshot action, this property is always set to `screenshot`.
   */
  type: 'screenshot';
}

/**
 * Action for scrolling
 */
export interface ActionScroll {
  /**
   * The delta values for scrolling
   */
  delta: {
    /**
     * The horizontal scroll distance.
     */
    x: number;

    /**
     * The vertical scroll distance.
     */
    y: number;
  };

  /**
   * Specifies the event type.
   * For a scroll action, this property is always set to `scroll`.
   */
  type: 'scroll';

  /**
   * The coordinates where the scroll occurred
   */
  coordinates: {
    /**
     * The x-coordinate where the scroll occurred.
     */
    x: number;

    /**
     * The y-coordinate where the scroll occurred.
     */
    y: number;
  };
}

/**
 * Action for typing text
 */
export interface ActionType {
  /**
   * The text to type.
   */
  text: string;

  /**
   * Specifies the event type.
   * For a type action, this property is always set to `type`.
   */
  type: 'type';
}

/**
 * Action for waiting
 */
export interface ActionWait {
  /**
   * Specifies the event type.
   * For a wait action, this property is always set to `wait`.
   */
  type: 'wait';
}

/**
 * Union type for all possible actions
 */
export type Action =
  | ActionClick
  | ActionDoubleClick
  | ActionDrag
  | ActionKeypress
  | ActionMove
  | ActionScreenshot
  | ActionScroll
  | ActionType
  | ActionWait;

/**
 * Pending safety check for computer calls
 */
export interface PendingSafetyCheck {
  /**
   * The ID of the pending safety check.
   */
  id: string;

  /**
   * The type of the pending safety check.
   */
  code: string;

  /**
   * Details about the pending safety check.
   */
  message: string;
}

/**
 * Computer tool call response
 */
export interface ResponseComputerToolCall {
  /**
   * The unique ID of the computer call.
   */
  id: string;

  /**
   * The action to perform.
   */
  computer: Action;

  /**
   * An identifier used when responding to the tool call with output.
   */
  call_id: string;

  /**
   * The pending safety checks for the computer call.
   */
  pending_safety_checks: PendingSafetyCheck[];

  /**
   * The status of the item.
   * One of `in_progress`, `completed`, or `incomplete`. Populated when items are
   * returned via API.
   */
  status: 'in_progress' | 'completed' | 'incomplete';

  /**
   * The type of the computer call. Always `computer_call`.
   */
  type: 'computer_call';
}
