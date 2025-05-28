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

  feedback: defineTable({
    message_id: v.string(),
    user_id: v.string(),
    chat_id: v.string(),
    feedback: v.union(v.literal('good'), v.literal('bad')),
    reason: v.optional(v.string()),
    detailed_feedback: v.optional(v.string()),
    model: v.string(),
    updated_at: v.number(),
    sequence_number: v.number(),
    allow_email: v.optional(v.boolean()),
    allow_sharing: v.optional(v.boolean()),
    has_files: v.boolean(),
    plugin: v.string(),
  })
    .index('by_message', ['message_id'])
    .index('by_user', ['user_id'])
    .index('by_updated_at', ['updated_at'])
    .index('by_chat', ['chat_id'])
    .index('by_chat_and_sequence', ['chat_id', 'sequence_number']),
});
