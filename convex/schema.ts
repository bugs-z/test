import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
  sandboxes: defineTable({
    user_id: v.string(),
    sandbox_id: v.string(),
    template: v.string(),
    status: v.union(
      v.literal('active'),
      v.literal('pausing'),
      v.literal('paused'),
    ),
    updated_at: v.number(),
  })
    .index('by_user_and_template', ['user_id', 'template'])
    .index('by_sandbox_id', ['sandbox_id']),
});
