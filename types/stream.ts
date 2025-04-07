export interface DataPartValue {
  citations?: string[];
  type?: string;
  content?: string;
  finishReason?: string;
  sandboxType?: 'persistent-sandbox' | 'temporary-sandbox';
  // Thinking
  elapsed_secs?: number;
}
