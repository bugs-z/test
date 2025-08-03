// must not describe 'use server' here to avoid security issues.
import { epochTimeToNaturalLanguage } from '../utils';
import { getRedis } from './redis';
import { getSubscriptionInfo } from './subscription-utils';
import type {
  RateLimitInfo,
  SubscriptionStatus,
  RateLimitedFeature,
} from '@/types';

// Constants
const TIME_WINDOW = 180 * 60 * 1000; // 180 minutes in milliseconds
const FALLBACK_MODELS: Record<string, string> = {
  'pentestgpt-pro': 'pentestgpt',
  pentestgpt: 'pentestgpt-pro',
};

const MODEL_DISPLAY_NAMES: Record<string, string> = {
  pentestgpt: 'Small Model',
  'pentestgpt-pro': 'Large Model',
  terminal: 'Terminal',
  'stt-1': 'speech-to-text',
  'reasoning-model': 'reasoning model',
  'image-gen': 'image generation',
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  timeRemaining: number | null;
  subscriptionType?: 'free' | 'premium' | 'team';
  fallbackModel?: string;
};

/**
 * rate limiting by sliding window algorithm.
 *
 * check if the user is allowed to make a request.
 * if the user is allowed, decrease the remaining count by 1.
 */
export async function ratelimit(
  userId: string,
  model: string,
  subscriptionInfo?: { planType: SubscriptionStatus },
): Promise<RateLimitResult> {
  if (!isRateLimiterEnabled()) {
    return { allowed: true, remaining: -1, timeRemaining: null };
  }
  const subInfo = subscriptionInfo || (await getSubscriptionInfo(userId));
  return _ratelimit(model, userId, subInfo);
}

function isRateLimiterEnabled(): boolean {
  return process.env.RATELIMITER_ENABLED?.toLowerCase() !== 'false';
}

export async function _ratelimit(
  model: string,
  userId: string,
  subscriptionInfo: { planType: SubscriptionStatus },
): Promise<RateLimitResult> {
  try {
    const storageKey = _makeStorageKey(userId, model);
    const [remaining, timeRemaining] = await getRemaining(
      userId,
      model,
      subscriptionInfo,
    );

    const subscriptionType =
      subscriptionInfo.planType === 'team'
        ? 'team'
        : subscriptionInfo.planType === 'pro'
          ? 'premium'
          : 'free';

    const isPremium = isPremiumUser(subscriptionInfo);

    if (remaining === 0) {
      // For premium users, check fallback model
      if (isPremium) {
        const fallbackModel = getFallbackModel(model);
        if (fallbackModel) {
          const fallbackCheck = await checkFallbackModel(
            userId,
            fallbackModel,
            subscriptionInfo,
          );
          if (fallbackCheck.allowed) {
            return {
              allowed: false, // Still not allowed for the primary model
              remaining,
              timeRemaining: timeRemaining!,
              subscriptionType,
              fallbackModel,
            };
          }
        }
      }

      return {
        allowed: false,
        remaining,
        timeRemaining: timeRemaining!,
        subscriptionType,
      };
    }
    await _addRequest(storageKey);
    return {
      allowed: true,
      remaining: remaining - 1,
      timeRemaining: timeRemaining,
      subscriptionType,
    };
  } catch (error) {
    console.error('Redis rate limiter error:', error);
    return { allowed: false, remaining: 0, timeRemaining: 60000 };
  }
}

export async function getRemaining(
  userId: string,
  model: string,
  subscriptionInfo: { planType: SubscriptionStatus },
): Promise<[number, number | null]> {
  const storageKey = _makeStorageKey(userId, model);
  const timeWindow = TIME_WINDOW;
  const now = Date.now();
  const limit = _getLimit(model, subscriptionInfo);

  const redis = getRedis();
  const [[firstMessageTime], count] = await Promise.all([
    redis.zrange(storageKey, 0, 0, { withScores: true }),
    redis.zcard(storageKey),
  ]);

  if (!firstMessageTime) {
    return [limit, null];
  }

  const windowEndTime = Number(firstMessageTime) + timeWindow;
  if (now >= windowEndTime) {
    // The window has expired, no need to reset the count here
    return [limit, null];
  }

  const remaining = Math.max(0, limit - count);
  return [remaining, windowEndTime - now];
}

/**
 * Get the fallback model for premium users when the primary model hits rate limit
 */
function getFallbackModel(model: string): string | null {
  return FALLBACK_MODELS[model] || null;
}

/**
 * Check if a fallback model is available for premium users
 */
async function checkFallbackModel(
  userId: string,
  fallbackModel: string,
  subscriptionInfo: { planType: SubscriptionStatus },
): Promise<{
  allowed: boolean;
  remaining: number;
  timeRemaining: number | null;
}> {
  const [remaining, timeRemaining] = await getRemaining(
    userId,
    fallbackModel,
    subscriptionInfo,
  );

  return {
    allowed: remaining > 0,
    remaining,
    timeRemaining,
  };
}

function _getLimit(
  model: string,
  subscriptionInfo: { planType: SubscriptionStatus },
): number {
  const isPaid =
    subscriptionInfo.planType === 'pro' || subscriptionInfo.planType === 'team';
  const suffix = isPaid ? '_PREMIUM' : '_FREE';

  // Standard model handling
  const fixedModelName = _getFixedModelName(model);
  const limitKey = `RATELIMITER_LIMIT_${fixedModelName}${suffix}`;
  const defaultLimit = 0;
  const limit = getValidatedLimit(process.env[limitKey], defaultLimit);

  if (subscriptionInfo.planType === 'team') {
    const teamMultiplier = Number(process.env.TEAM_LIMIT_MULTIPLIER) || 1.8;
    return Math.floor(limit * teamMultiplier);
  }

  return limit;
}

// Helper function to validate and parse limits
function getValidatedLimit(
  value: string | undefined,
  defaultValue: number,
): number {
  if (value === undefined) return defaultValue;

  const parsedValue = Number(value);
  return !Number.isNaN(parsedValue) && parsedValue >= 0
    ? parsedValue
    : defaultValue;
}

async function _addRequest(key: string) {
  const now = Date.now();
  const timeWindow = TIME_WINDOW;

  const redis = getRedis();
  try {
    const [firstMessageTime] = await redis.zrange(key, 0, 0, {
      withScores: true,
    });

    if (!firstMessageTime || now - Number(firstMessageTime) >= timeWindow) {
      // Start a new window
      await redis
        .multi()
        .del(key)
        .zadd(key, { score: now, member: now })
        .expire(key, Math.ceil(timeWindow / 1000))
        .exec();
    } else {
      // Add to existing window
      await redis.zadd(key, { score: now, member: now });
    }
  } catch (error) {
    console.error('Redis _addRequest error:', error);
    throw error; // Re-throw to be caught in _ratelimit
  }
}

function _getFixedModelName(model: string): string {
  return (model.startsWith('gpt-4') ? 'gpt-4' : model)
    .replace(/-/g, '_')
    .toUpperCase();
}

function _makeStorageKey(userId: string, model: string): string {
  // For all models, use the model-specific key
  const fixedModelName = _getFixedModelName(model);
  return `ratelimit:${userId}:${fixedModelName}`;
}

/**
 * Get premium user suggestions for alternative models
 */
function getPremiumModelSuggestions(model: string): string {
  if (model === 'pentestgpt' || model === 'pentestgpt-pro') {
    return `⚠️ You've reached the limits for both Small and Large models.\n\nPlease wait for the reset.`;
  }
  if (model === 'reasoning-model') {
    return `\n\nIn the meantime, you can use Large Model or Small Model`;
  }
  return '';
}

/**
 * Get upgrade message for free users
 */
function getUpgradeMessage(): string {
  return `\n\n🔓 Want more? Upgrade to Pro or Team and unlock a world of features:
- Access to smarter models
- Extended limits on messaging
- Access to file uploads, vision, web search, and browsing
- Access to terminal and reasoning model
- Opportunities to test new features`;
}

export function getRateLimitErrorMessage(
  timeRemaining: number,
  premium: boolean,
  model: string,
  fallbackModel?: string,
): string {
  const remainingText = epochTimeToNaturalLanguage(timeRemaining);

  // Terminal model special handling
  if (model === 'terminal') {
    const baseMessage = `⚠️ You've reached the limit for Terminal usage.\n\nTo ensure fair usage for all users, please wait ${remainingText} before trying again.`;
    return premium
      ? baseMessage
      : `${baseMessage}\n\n🚀 Consider upgrading to Pro or Team for higher Terminal usage limits and more features.`;
  }

  // Premium users with fallback available - no error message needed
  if (premium && fallbackModel) {
    return '';
  }

  let message = `⚠️ You've reached the limit for ${getModelName(model)}.\n\nTo ensure fair usage for all users, please wait ${remainingText} before trying again.`;

  if (premium) {
    const suggestion = getPremiumModelSuggestions(model);
    message = suggestion.startsWith('⚠️')
      ? suggestion.replace(
          'Please wait for the reset.',
          `Please wait ${remainingText} before trying again.`,
        )
      : message + suggestion;
  } else {
    message += getUpgradeMessage();
  }

  return message.trim();
}

function getModelName(model: string): string {
  return MODEL_DISPLAY_NAMES[model] || model;
}

/**
 * Check if a user has premium subscription
 */
function isPremiumUser(subscriptionInfo: {
  planType: SubscriptionStatus;
}): boolean {
  return (
    subscriptionInfo.planType === 'pro' || subscriptionInfo.planType === 'team'
  );
}

/**
 * Create rate limit info object
 */
function createRateLimitInfo(
  model: string,
  remaining: number,
  max: number,
  isPremium: boolean,
  timeRemaining: number | null,
  message?: string,
): RateLimitInfo {
  const info: RateLimitInfo = {
    remaining,
    max,
    isPremiumUser: isPremium,
    timeRemaining,
    feature: model as RateLimitedFeature,
  };

  if (message) {
    info.message = message;
  }

  return info;
}

/**
 * Handle fallback model consumption and return updated info
 */
async function handleFallbackModel(
  userId: string,
  fallbackModel: string,
  subInfo: { planType: SubscriptionStatus },
  isPremium: boolean,
): Promise<RateLimitInfo> {
  // Consume a request from the fallback model
  const fallbackStorageKey = _makeStorageKey(userId, fallbackModel);
  await _addRequest(fallbackStorageKey);

  // Get updated rate limit info for the fallback model (after consuming)
  const fallbackMax = _getLimit(fallbackModel, subInfo);
  const [fallbackRemaining, fallbackTimeRemaining] = await getRemaining(
    userId,
    fallbackModel,
    subInfo,
  );

  return createRateLimitInfo(
    fallbackModel,
    fallbackRemaining - 1, // Subtract 1 since we just consumed a request
    fallbackMax,
    isPremium,
    fallbackTimeRemaining,
  );
}

export async function checkRatelimitOnApi(
  userId: string,
  model: string,
  subscriptionInfo?: { planType: SubscriptionStatus },
): Promise<{ allowed: boolean; info: RateLimitInfo }> {
  const result = await ratelimit(userId, model, subscriptionInfo);
  const subInfo = subscriptionInfo || (await getSubscriptionInfo(userId));
  const isPremium = isPremiumUser(subInfo);
  const max = _getLimit(model, subInfo);

  // Handle fallback for premium users when original model is rate limited
  if (!result.allowed && isPremium && result.fallbackModel) {
    const fallbackInfo = await handleFallbackModel(
      userId,
      result.fallbackModel,
      subInfo,
      isPremium,
    );
    return { allowed: true, info: fallbackInfo };
  }

  // Create info for original model (either allowed or rate limited)
  const message = !result.allowed
    ? getRateLimitErrorMessage(
        result.timeRemaining!,
        isPremium,
        model,
        result.fallbackModel,
      )
    : undefined;

  const info = createRateLimitInfo(
    model,
    result.remaining,
    max,
    isPremium,
    result.timeRemaining,
    message,
  );

  return { allowed: result.allowed, info };
}
