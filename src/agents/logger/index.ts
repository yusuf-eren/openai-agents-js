/**
 * Log levels
 */
export enum LogLevel {
  DEBUG = 10,
  INFO = 20,
  WARNING = 30,
  ERROR = 40,
  CRITICAL = 50,
}

/**
 * Custom logger implementation for the OpenAI Agents SDK
 */
class Logger {
  private name: string;
  private level: LogLevel = LogLevel.INFO;

  constructor(name: string) {
    this.name = name;
  }

  /**
   * Set the log level
   */
  setLevel(level: LogLevel): void {
    this.level = level;
  }

  /**
   * Check if a message at the given level would be logged
   */
  private isEnabledFor(level: LogLevel): boolean {
    return level >= this.level;
  }

  /**
   * Format a log message
   */
  private format(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `${timestamp} [${level}] ${this.name}: ${message}`;
  }

  /**
   * Log a debug message
   */
  debug(message: string): void {
    if (this.isEnabledFor(LogLevel.DEBUG)) {
      console.debug(this.format('DEBUG', message));
    }
  }

  /**
   * Log an info message
   */
  info(message: string): void {
    if (this.isEnabledFor(LogLevel.INFO)) {
      console.info(this.format('INFO', message));
    }
  }

  /**
   * Log a warning message
   */
  warning(message: string): void {
    if (this.isEnabledFor(LogLevel.WARNING)) {
      console.warn(this.format('WARNING', message));
    }
  }

  /**
   * Log an error message
   */
  error(message: string): void {
    if (this.isEnabledFor(LogLevel.ERROR)) {
      console.error(this.format('ERROR', message));
    }
  }

  /**
   * Log a critical message
   */
  critical(message: string): void {
    if (this.isEnabledFor(LogLevel.CRITICAL)) {
      console.error(this.format('CRITICAL', message));
    }
  }
}

/**
 * Get a logger with the given name
 */
export function getLogger(name: string): Logger {
  return new Logger(name);
}

/**
 * Default logger instance for the OpenAI Agents SDK
 */
export const logger = getLogger('openai.agents');
