import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

const crons = cronJobs();

// Run every week on Sunday at 00:00 UTC
crons.cron(
  'delete-old-feedback',
  '0 0 * * 0', // Every Sunday at midnight UTC
  internal.feedback.deleteOldFeedback,
);

// Run subscription discrepancy check and fix every day at 2 AM UTC
crons.cron(
  'check-and-fix-subscription-discrepancies',
  '0 2 * * *', // Every day at 2 AM UTC
  internal.subscriptionAnalysis.checkAndFixDiscrepancies,
  {},
);

export default crons;
