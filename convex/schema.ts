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

  messages: defineTable({
    id: v.string(),
    chat_id: v.string(),
    user_id: v.string(),
    content: v.string(),
    image_paths: v.array(v.string()),
    model: v.string(),
    plugin: v.optional(v.string()),
    role: v.string(),
    sequence_number: v.number(),
    thinking_content: v.optional(v.string()),
    thinking_elapsed_secs: v.optional(v.number()),
    updated_at: v.optional(v.number()),
    attachments: v.optional(v.array(v.any())),
    citations: v.array(v.string()),
  })
    .index('by_chat', ['chat_id'])
    .index('by_user', ['user_id'])
    .index('by_chat_and_sequence', ['chat_id', 'sequence_number'])
    .index('by_updated_at', ['updated_at'])
    .index('by_message_id', ['id']),

  files: defineTable({
    id: v.string(),
    user_id: v.string(),
    file_path: v.string(),
    name: v.string(),
    size: v.number(),
    tokens: v.number(),
    type: v.string(),
    message_id: v.optional(v.string()),
    chat_id: v.optional(v.string()),
    updated_at: v.optional(v.number()),
  })
    .index('by_message', ['message_id'])
    .index('by_chat', ['chat_id'])
    .index('by_user', ['user_id'])
    .index('by_updated_at', ['updated_at'])
    .index('by_file_id', ['id']),

  file_items: defineTable({
    id: v.string(),
    file_id: v.string(),
    user_id: v.string(),
    content: v.string(),
    tokens: v.number(),
    name: v.optional(v.string()),
    sequence_number: v.number(),
    updated_at: v.optional(v.number()),
    message_id: v.optional(v.string()),
    chat_id: v.optional(v.string()),
  })
    .index('by_file_id', ['file_id'])
    .index('by_file_and_sequence', ['file_id', 'sequence_number'])
    .index('by_name', ['name'])
    .index('by_user', ['user_id'])
    .index('by_updated_at', ['updated_at'])
    .index('by_message', ['message_id'])
    .index('by_chat', ['chat_id'])
    .index('by_message_and_chat', ['message_id', 'chat_id']),
});
