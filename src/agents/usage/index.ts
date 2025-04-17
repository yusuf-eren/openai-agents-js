/**
 * Tracks API usage metrics for LLM requests.
 */
export class Usage {
  /**
   * Total requests made to the LLM API.
   */
  requests: number;

  /**
   * Total input tokens sent, across all requests.
   */
  input_tokens: number;

  /**
   * Total output tokens received, across all requests.
   */
  output_tokens: number;

  /**
   * Total tokens sent and received, across all requests.
   */
  total_tokens: number;

  constructor({
    requests = 0,
    input_tokens = 0,
    output_tokens = 0,
    total_tokens = 0,
  }: {
    requests?: number;
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  } = {}) {
    this.requests = requests;
    this.input_tokens = input_tokens;
    this.output_tokens = output_tokens;
    this.total_tokens = total_tokens;
  }

  /**
   * Adds usage statistics from another Usage object to this one.
   * @param other The Usage object to add.
   */
  add(other: Usage): void {
    this.requests += other.requests || 0;
    this.input_tokens += other.input_tokens || 0;
    this.output_tokens += other.output_tokens || 0;
    this.total_tokens += other.total_tokens || 0;
  }
}
