export type RateLimitedFeature =
  | 'pentestgpt' // Small Model
  | 'pentestgpt-pro' // Large Model
  | 'terminal' // Terminal
  | 'stt-1' // Speech-to-text
  | 'reasoning-model' // Reasoning model
  | 'image-gen' // Image generation
  | 'deep-research'; // Deep research

export interface RateLimitInfo {
  remaining: number;
  max: number;
  isPremiumUser: boolean;
  timeRemaining: number | null; // Time remaining in milliseconds until reset
  feature: RateLimitedFeature; // What feature is being rate limited
  message?: string; // Keep for backward compatibility with error messages
}
