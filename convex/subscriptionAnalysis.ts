import {
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server';
import { v } from 'convex/values';
import { internal } from './_generated/api';

/**
 * Internal action to sync with Stripe
 */
export const syncWithStripeAction = internalAction({
  args: {
    subscriptionId: v.string(),
    dbSubscriptionId: v.optional(v.id('subscriptions')),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    // If dbSubscriptionId is not provided, look it up
    let dbSubscriptionId = args.dbSubscriptionId;
    if (!dbSubscriptionId) {
      const dbSub = await ctx.runQuery(
        internal.subscriptionAnalysis.getSubscriptionByStripeId,
        {
          subscriptionId: args.subscriptionId,
        },
      );
      if (!dbSub) {
        console.error(
          `Database subscription not found for Stripe ID: ${args.subscriptionId}`,
        );
        return null;
      }
      dbSubscriptionId = dbSub._id;
    }

    try {
      // Fetch subscription from Stripe
      const stripeSubscription = await stripe.subscriptions.retrieve(
        args.subscriptionId,
      );

      // Update the database subscription
      await ctx.runMutation(
        internal.subscriptionAnalysis.updateSubscriptionStatus,
        {
          dbSubscriptionId,
          status: stripeSubscription.status,
          cancelAt: stripeSubscription.cancel_at
            ? new Date(stripeSubscription.cancel_at * 1000).toISOString()
            : null,
          canceledAt: stripeSubscription.canceled_at
            ? new Date(stripeSubscription.canceled_at * 1000).toISOString()
            : null,
          endedAt: stripeSubscription.ended_at
            ? new Date(stripeSubscription.ended_at * 1000).toISOString()
            : null,
        },
      );

      console.log(
        `Successfully synced subscription ${args.subscriptionId} with status ${stripeSubscription.status}`,
      );
    } catch (error: unknown) {
      // Check if this is a "subscription not found" error from Stripe
      if (
        error instanceof Error &&
        (error.message.includes('No such subscription') ||
          (error as any).type === 'StripeInvalidRequestError')
      ) {
        console.log(
          `Subscription ${args.subscriptionId} not found in Stripe - marking as canceled`,
        );

        // Mark the subscription as canceled since it doesn't exist in Stripe
        await ctx.runMutation(
          internal.subscriptionAnalysis.updateSubscriptionStatus,
          {
            dbSubscriptionId,
            status: 'canceled',
            cancelAt: null,
            canceledAt: new Date().toISOString(),
            endedAt: new Date().toISOString(),
          },
        );

        console.log(
          `Successfully marked subscription ${args.subscriptionId} as canceled (not found in Stripe)`,
        );
      } else {
        console.error(
          `Failed to sync subscription ${args.subscriptionId}:`,
          error,
        );
      }
    }

    return null;
  },
});

/**
 * Internal query to get subscription by Stripe ID
 */
export const getSubscriptionByStripeId = internalQuery({
  args: {
    subscriptionId: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.id('subscriptions'),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const subscription = await ctx.db
      .query('subscriptions')
      .withIndex('by_subscription_id', (q) =>
        q.eq('subscription_id', args.subscriptionId),
      )
      .first();

    return subscription ? { _id: subscription._id } : null;
  },
});

/**
 * Internal mutation to update subscription status
 */
export const updateSubscriptionStatus = internalMutation({
  args: {
    dbSubscriptionId: v.id('subscriptions'),
    status: v.string(),
    cancelAt: v.union(v.string(), v.null()),
    canceledAt: v.union(v.string(), v.null()),
    endedAt: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.dbSubscriptionId, {
      status: args.status,
      cancel_at: args.cancelAt,
      canceled_at: args.canceledAt,
      ended_at: args.endedAt,
    });
    return null;
  },
});

/**
 * Compare database subscription statuses with actual Stripe statuses
 * This action fetches data from Stripe to find real discrepancies
 */
export const compareWithStripe = internalAction({
  args: {},
  returns: v.object({
    totalChecked: v.number(),
    discrepancies: v.array(
      v.object({
        subscription_id: v.string(),
        user_id: v.string(),
        dbStatus: v.string(),
        stripeStatus: v.string(),
        dbCancelAt: v.union(v.string(), v.null()),
        stripeCancelAt: v.union(v.string(), v.null()),
        dbCanceledAt: v.union(v.string(), v.null()),
        stripeCanceledAt: v.union(v.string(), v.null()),
        dbEndedAt: v.union(v.string(), v.null()),
        stripeEndedAt: v.union(v.string(), v.null()),
      }),
    ),
    errors: v.array(
      v.object({
        subscription_id: v.string(),
        error: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    // Get subscriptions to check
    const subscriptionsToCheck: Array<{
      subscription_id: string;
      user_id: string;
      status: string;
      cancel_at: string | null;
      canceled_at: string | null;
      ended_at: string | null;
    }> = await ctx.runQuery(
      internal.subscriptionAnalysis.getSubscriptionsToCheck,
      {},
    );

    const discrepancies = [];
    const errors = [];
    let totalChecked = 0;

    for (const dbSub of subscriptionsToCheck) {
      try {
        totalChecked++;

        // Fetch from Stripe
        const stripeSub = await stripe.subscriptions.retrieve(
          dbSub.subscription_id,
        );

        // Compare statuses
        const dbStatus = dbSub.status;
        const stripeStatus = stripeSub.status;

        // Check if there's a discrepancy
        const hasStatusDiscrepancy = dbStatus !== stripeStatus;

        // Check date discrepancies
        const stripeCancelAt = stripeSub.cancel_at
          ? new Date(stripeSub.cancel_at * 1000).toISOString()
          : null;
        const stripeCanceledAt = stripeSub.canceled_at
          ? new Date(stripeSub.canceled_at * 1000).toISOString()
          : null;
        const stripeEndedAt = stripeSub.ended_at
          ? new Date(stripeSub.ended_at * 1000).toISOString()
          : null;

        // Normalize database dates to ISO format for comparison
        const dbCancelAtNormalized = dbSub.cancel_at
          ? new Date(dbSub.cancel_at).toISOString()
          : null;
        const dbCanceledAtNormalized = dbSub.canceled_at
          ? new Date(dbSub.canceled_at).toISOString()
          : null;
        const dbEndedAtNormalized = dbSub.ended_at
          ? new Date(dbSub.ended_at).toISOString()
          : null;

        const hasDateDiscrepancy =
          dbCancelAtNormalized !== stripeCancelAt ||
          dbCanceledAtNormalized !== stripeCanceledAt ||
          dbEndedAtNormalized !== stripeEndedAt;

        if (hasStatusDiscrepancy || hasDateDiscrepancy) {
          discrepancies.push({
            subscription_id: dbSub.subscription_id,
            user_id: dbSub.user_id,
            dbStatus,
            stripeStatus,
            dbCancelAt: dbCancelAtNormalized,
            stripeCancelAt,
            dbCanceledAt: dbCanceledAtNormalized,
            stripeCanceledAt,
            dbEndedAt: dbEndedAtNormalized,
            stripeEndedAt,
          });
        }
      } catch (error: unknown) {
        // Check if this is a "subscription not found" error from Stripe
        if (
          error instanceof Error &&
          (error.message.includes('No such subscription') ||
            (error as any).type === 'StripeInvalidRequestError')
        ) {
          console.log(
            `Skipping subscription ${dbSub.subscription_id} - not found in Stripe (likely deleted)`,
          );
          // Don't count this as an error, just skip it
          continue;
        }

        // For other errors, log them
        console.error(
          `Error checking subscription ${dbSub.subscription_id}:`,
          error,
        );
        errors.push({
          subscription_id: dbSub.subscription_id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Log summary results
    let summaryMessage = `\n📊 STRIPE COMPARISON SUMMARY:\n`;
    summaryMessage += `Total subscriptions checked: ${totalChecked}\n`;
    summaryMessage += `Discrepancies found: ${discrepancies.length}\n`;
    summaryMessage += `Errors encountered: ${errors.length}\n`;

    if (discrepancies.length > 0) {
      summaryMessage += `\n🚨 DISCREPANCIES FOUND:\n`;
      discrepancies.forEach((disc, index) => {
        summaryMessage += `${index + 1}. Subscription: ${disc.subscription_id}\n`;
        summaryMessage += `   User: ${disc.user_id}\n`;
        summaryMessage += `   DB Status: ${disc.dbStatus} → Stripe Status: ${disc.stripeStatus}\n`;
        if (disc.dbCancelAt !== disc.stripeCancelAt) {
          summaryMessage += `   Cancel At: DB(${disc.dbCancelAt}) → Stripe(${disc.stripeCancelAt})\n`;
        }
        if (disc.dbCanceledAt !== disc.stripeCanceledAt) {
          summaryMessage += `   Canceled At: DB(${disc.dbCanceledAt}) → Stripe(${disc.stripeCanceledAt})\n`;
        }
        if (disc.dbEndedAt !== disc.stripeEndedAt) {
          summaryMessage += `   Ended At: DB(${disc.dbEndedAt}) → Stripe(${disc.stripeEndedAt})\n`;
        }
        summaryMessage += `\n`;
      });
    } else {
      summaryMessage += `\n✅ No discrepancies found! All subscriptions are in sync.\n`;
    }

    console.log(summaryMessage);

    return {
      totalChecked,
      discrepancies,
      errors,
    };
  },
});

/**
 * Internal action to fix all discrepancies by syncing with Stripe
 */
export const fixAllDiscrepanciesAction = internalAction({
  args: {},
  returns: v.object({
    totalChecked: v.number(),
    discrepanciesFound: v.number(),
    fixesScheduled: v.number(),
    errors: v.array(
      v.object({
        subscription_id: v.string(),
        error: v.string(),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

    // Get subscriptions to check
    const subscriptionsToCheck: Array<{
      subscription_id: string;
      user_id: string;
      status: string;
      cancel_at: string | null;
      canceled_at: string | null;
      ended_at: string | null;
    }> = await ctx.runQuery(
      internal.subscriptionAnalysis.getSubscriptionsToCheck,
      {},
    );

    const discrepancies = [];
    const errors = [];
    let totalChecked = 0;
    let fixesScheduled = 0;

    // First, identify all discrepancies
    for (const dbSub of subscriptionsToCheck) {
      try {
        totalChecked++;

        // Fetch from Stripe
        const stripeSub = await stripe.subscriptions.retrieve(
          dbSub.subscription_id,
        );

        // Compare statuses and dates
        const dbStatus = dbSub.status;
        const stripeStatus = stripeSub.status;

        const stripeCancelAt = stripeSub.cancel_at
          ? new Date(stripeSub.cancel_at * 1000).toISOString()
          : null;
        const stripeCanceledAt = stripeSub.canceled_at
          ? new Date(stripeSub.canceled_at * 1000).toISOString()
          : null;
        const stripeEndedAt = stripeSub.ended_at
          ? new Date(stripeSub.ended_at * 1000).toISOString()
          : null;

        const dbCancelAtNormalized = dbSub.cancel_at
          ? new Date(dbSub.cancel_at).toISOString()
          : null;
        const dbCanceledAtNormalized = dbSub.canceled_at
          ? new Date(dbSub.canceled_at).toISOString()
          : null;
        const dbEndedAtNormalized = dbSub.ended_at
          ? new Date(dbSub.ended_at).toISOString()
          : null;

        const hasStatusDiscrepancy = dbStatus !== stripeStatus;
        const hasDateDiscrepancy =
          dbCancelAtNormalized !== stripeCancelAt ||
          dbCanceledAtNormalized !== stripeCanceledAt ||
          dbEndedAtNormalized !== stripeEndedAt;

        if (hasStatusDiscrepancy || hasDateDiscrepancy) {
          discrepancies.push({
            subscription_id: dbSub.subscription_id,
            user_id: dbSub.user_id,
            dbStatus,
            stripeStatus,
            stripeCancelAt,
            stripeCanceledAt,
            stripeEndedAt,
          });
        }
      } catch (error: unknown) {
        // Check if this is a "subscription not found" error from Stripe
        if (
          error instanceof Error &&
          (error.message.includes('No such subscription') ||
            (error as any).type === 'StripeInvalidRequestError')
        ) {
          // Schedule a fix for subscriptions not found in Stripe (mark as canceled)
          discrepancies.push({
            subscription_id: dbSub.subscription_id,
            user_id: dbSub.user_id,
            dbStatus: dbSub.status,
            stripeStatus: 'canceled', // We'll mark it as canceled
            stripeCancelAt: null,
            stripeCanceledAt: new Date().toISOString(),
            stripeEndedAt: new Date().toISOString(),
          });
          continue;
        }

        // For other errors, log them
        console.error(
          `Error checking subscription ${dbSub.subscription_id}:`,
          error,
        );
        errors.push({
          subscription_id: dbSub.subscription_id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Now schedule fixes for all discrepancies
    for (const discrepancy of discrepancies) {
      try {
        await ctx.scheduler.runAfter(
          fixesScheduled * 1000, // Stagger by 1 second each
          internal.subscriptionAnalysis.syncWithStripeAction,
          {
            subscriptionId: discrepancy.subscription_id,
            // dbSubscriptionId will be looked up in the action
          },
        );
        fixesScheduled++;
      } catch (error) {
        console.error(
          `Failed to schedule sync for ${discrepancy.subscription_id}:`,
          error,
        );
        errors.push({
          subscription_id: discrepancy.subscription_id,
          error:
            error instanceof Error ? error.message : 'Failed to schedule fix',
        });
      }
    }

    // Log summary results
    let summaryMessage = `\n🔧 STRIPE FIX SUMMARY:\n`;
    summaryMessage += `Total subscriptions checked: ${totalChecked}\n`;
    summaryMessage += `Discrepancies found: ${discrepancies.length}\n`;
    summaryMessage += `Fixes scheduled: ${fixesScheduled}\n`;
    summaryMessage += `Errors encountered: ${errors.length}\n`;

    if (discrepancies.length > 0) {
      summaryMessage += `\n🚨 DISCREPANCIES BEING FIXED:\n`;
      discrepancies.forEach((disc, index) => {
        summaryMessage += `${index + 1}. Subscription: ${disc.subscription_id}\n`;
        summaryMessage += `   User: ${disc.user_id}\n`;
        summaryMessage += `   DB Status: ${disc.dbStatus} → Stripe Status: ${disc.stripeStatus}\n`;
        summaryMessage += `\n`;
      });
    } else {
      summaryMessage += `\n✅ No discrepancies found! All subscriptions are in sync.\n`;
    }

    console.log(summaryMessage);

    return {
      totalChecked,
      discrepanciesFound: discrepancies.length,
      fixesScheduled,
      errors,
    };
  },
});

/**
 * Internal query to get subscriptions to check
 */
export const getSubscriptionsToCheck = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      subscription_id: v.string(),
      user_id: v.string(),
      status: v.string(),
      cancel_at: v.union(v.string(), v.null()),
      canceled_at: v.union(v.string(), v.null()),
      ended_at: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    // Return ALL active subscriptions using index
    const activeSubscriptions = await ctx.db
      .query('subscriptions')
      .withIndex('by_status', (q) => q.eq('status', 'active'))
      .collect();

    return activeSubscriptions.map((sub) => ({
      subscription_id: sub.subscription_id,
      user_id: sub.user_id,
      status: sub.status,
      cancel_at: sub.cancel_at,
      canceled_at: sub.canceled_at,
      ended_at: sub.ended_at,
    }));
  },
});

/**
 * Internal action to check and fix all subscription discrepancies
 * This runs the comparison first, then fixes any discrepancies found
 */
export const checkAndFixDiscrepancies = internalAction({
  args: {},
  returns: v.object({
    checkResults: v.object({
      totalChecked: v.number(),
      discrepancies: v.array(
        v.object({
          subscription_id: v.string(),
          user_id: v.string(),
          dbStatus: v.string(),
          stripeStatus: v.string(),
          dbCancelAt: v.union(v.string(), v.null()),
          stripeCancelAt: v.union(v.string(), v.null()),
          dbCanceledAt: v.union(v.string(), v.null()),
          stripeCanceledAt: v.union(v.string(), v.null()),
          dbEndedAt: v.union(v.string(), v.null()),
          stripeEndedAt: v.union(v.string(), v.null()),
        }),
      ),
      errors: v.array(
        v.object({
          subscription_id: v.string(),
          error: v.string(),
        }),
      ),
    }),
    fixResults: v.object({
      totalChecked: v.number(),
      discrepanciesFound: v.number(),
      fixesScheduled: v.number(),
      errors: v.array(
        v.object({
          subscription_id: v.string(),
          error: v.string(),
        }),
      ),
    }),
  }),
  handler: async (ctx, args) => {
    console.log(
      '🔍 Starting subscription discrepancy check and fix process...',
    );

    // First, run the comparison to check for discrepancies
    console.log('📊 Step 1: Checking for discrepancies with Stripe...');
    const checkResults: {
      totalChecked: number;
      discrepancies: Array<{
        subscription_id: string;
        user_id: string;
        dbStatus: string;
        stripeStatus: string;
        dbCancelAt: string | null;
        stripeCancelAt: string | null;
        dbCanceledAt: string | null;
        stripeCanceledAt: string | null;
        dbEndedAt: string | null;
        stripeEndedAt: string | null;
      }>;
      errors: Array<{
        subscription_id: string;
        error: string;
      }>;
    } = await ctx.runAction(
      internal.subscriptionAnalysis.compareWithStripe,
      {},
    );

    console.log(
      `✅ Check completed: ${checkResults.discrepancies.length} discrepancies found out of ${checkResults.totalChecked} subscriptions checked`,
    );

    // If discrepancies were found, run the fix action
    let fixResults: {
      totalChecked: number;
      discrepanciesFound: number;
      fixesScheduled: number;
      errors: Array<{
        subscription_id: string;
        error: string;
      }>;
    };

    if (checkResults.discrepancies.length > 0) {
      console.log('🔧 Step 2: Fixing discrepancies...');
      fixResults = await ctx.runAction(
        internal.subscriptionAnalysis.fixAllDiscrepanciesAction,
        {},
      );
      console.log(
        `✅ Fix completed: ${fixResults.fixesScheduled} fixes scheduled`,
      );
    } else {
      console.log('✅ No discrepancies found, skipping fix step');
      fixResults = {
        totalChecked: checkResults.totalChecked,
        discrepanciesFound: 0,
        fixesScheduled: 0,
        errors: [],
      };
    }

    console.log('🎉 Subscription discrepancy check and fix process completed!');

    return {
      checkResults,
      fixResults,
    };
  },
});
