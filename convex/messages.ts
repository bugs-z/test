import { mutation, query, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import type { Id, Doc } from './_generated/dataModel';
import { api, internal } from './_generated/api';
import { v4 as uuidv4 } from 'uuid';

/**
 * Get the next sequence number for a chat
 */
export const getNextMessageSequence = query({
  args: {
    chatId: v.string(),
  },
  returns: v.number(),
  handler: async (ctx, args): Promise<number> => {
    const messages = await ctx.db
      .query('messages')
      .withIndex('by_chat_and_sequence', (q) => q.eq('chat_id', args.chatId))
      .order('desc')
      .take(1);

    return messages.length > 0 ? messages[0].sequence_number + 1 : 1;
  },
});

/**
 * Save an assistant message
 */
export const saveAssistantMessage = mutation({
  args: {
    chatId: v.string(),
    userId: v.string(),
    content: v.string(),
    model: v.string(),
    plugin: v.optional(v.string()),
    thinkingContent: v.optional(v.string()),
    thinkingElapsedSecs: v.optional(v.number()),
    thinkingEnabled: v.boolean(),
    citations: v.array(v.string()),
    attachments: v.optional(v.array(v.any())),
    isContinuation: v.optional(v.boolean()),
    isTerminalContinuation: v.optional(v.boolean()),
    editSequenceNumber: v.optional(v.number()),
    assistantMessageId: v.optional(v.string()),
  },
  returns: v.id('messages'),
  handler: async (ctx, args): Promise<Id<'messages'>> => {
    const {
      chatId,
      userId,
      content,
      model,
      plugin,
      thinkingContent,
      thinkingElapsedSecs,
      citations,
      attachments,
      isContinuation,
      isTerminalContinuation,
      editSequenceNumber,
      assistantMessageId,
    } = args;

    // If this is a continuation, update the last assistant message
    if (isContinuation || isTerminalContinuation) {
      const lastAssistantMessage = await ctx.db
        .query('messages')
        .withIndex('by_chat', (q) => q.eq('chat_id', chatId))
        .filter((q) => q.eq(q.field('role'), 'assistant'))
        .order('desc')
        .first();

      if (!lastAssistantMessage) {
        throw new Error('No assistant message found to continue');
      }

      // Update the existing message
      await ctx.db.patch(lastAssistantMessage._id, {
        content: lastAssistantMessage.content + content,
        thinking_content: lastAssistantMessage.thinking_content
          ? lastAssistantMessage.thinking_content + (thinkingContent || '')
          : thinkingContent || undefined,
        thinking_elapsed_secs: lastAssistantMessage.thinking_elapsed_secs
          ? lastAssistantMessage.thinking_elapsed_secs +
            (thinkingElapsedSecs || 0)
          : thinkingElapsedSecs || undefined,
        citations: [...(lastAssistantMessage.citations || []), ...citations],
        attachments: [
          ...(lastAssistantMessage.attachments || []),
          ...(attachments || []),
        ],
        updated_at: Date.now(),
      });

      return lastAssistantMessage._id;
    }

    // Get the sequence number - use editSequenceNumber if provided, otherwise get next sequence
    const sequenceNumber =
      editSequenceNumber ??
      (await ctx.runQuery(api.messages.getNextMessageSequence, {
        chatId,
      }));

    // Create a new message
    const messageId: Id<'messages'> = await ctx.db.insert('messages', {
      id: assistantMessageId || uuidv4(),
      chat_id: chatId,
      user_id: userId,
      content,
      model,
      plugin,
      role: 'assistant',
      sequence_number: sequenceNumber,
      thinking_content: thinkingContent || undefined,
      thinking_elapsed_secs: thinkingElapsedSecs || undefined,
      citations,
      attachments: attachments || [],
      updated_at: Date.now(),
      image_paths: [],
    });

    return messageId;
  },
});

/**
 * Delete the last message in a chat
 */
export const deleteLastMessage = mutation({
  args: {
    chatId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const lastMessage = await ctx.db
      .query('messages')
      .withIndex('by_chat', (q) => q.eq('chat_id', args.chatId))
      .order('desc')
      .first();

    if (!lastMessage) {
      return false;
    }

    await ctx.db.delete(lastMessage._id);
    return true;
  },
});

/**
 * Delete messages including and after a specific sequence number
 */
export const deleteMessagesIncludingAndAfter = mutation({
  args: {
    chatId: v.string(),
    sequenceNumber: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    const messagesToDelete = await ctx.db
      .query('messages')
      .withIndex('by_chat_and_sequence', (q) => q.eq('chat_id', args.chatId))
      .filter((q) => q.gte(q.field('sequence_number'), args.sequenceNumber))
      .collect();

    for (const message of messagesToDelete) {
      await ctx.db.delete(message._id);
    }

    return true;
  },
});

/**
 * Insert a single message
 */
export const insertMessages = mutation({
  args: {
    message: v.object({
      id: v.string(),
      chat_id: v.string(),
      user_id: v.string(),
      content: v.string(),
      thinking_content: v.optional(v.string()),
      thinking_elapsed_secs: v.optional(v.number()),
      model: v.string(),
      plugin: v.optional(v.string()),
      role: v.string(),
      sequence_number: v.number(),
      image_paths: v.array(v.string()),
      citations: v.array(v.string()),
      attachments: v.array(v.any()),
    }),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    await ctx.db.insert('messages', {
      ...args.message,
      updated_at: Date.now(),
    });
    return args.message.id;
  },
});

/**
 * Internal query to get messages at a specific sequence number
 */
export const internalGetMessagesAtSequence = internalQuery({
  args: {
    chatId: v.string(),
    sequenceNumber: v.number(),
  },
  returns: v.array(
    v.object({
      id: v.string(),
      chat_id: v.string(),
      user_id: v.string(),
      content: v.string(),
      model: v.string(),
      plugin: v.optional(v.string()),
      role: v.string(),
      sequence_number: v.number(),
      thinking_content: v.optional(v.string()),
      thinking_elapsed_secs: v.optional(v.number()),
      image_paths: v.array(v.string()),
      citations: v.array(v.string()),
      attachments: v.array(v.any()),
      updated_at: v.optional(v.number()),
      created_at: v.number(),
    }),
  ),
  handler: async (ctx, args: { chatId: string; sequenceNumber: number }) => {
    const messages = await ctx.db
      .query('messages')
      .withIndex('by_chat_and_sequence', (q) => q.eq('chat_id', args.chatId))
      .filter((q) => q.eq(q.field('sequence_number'), args.sequenceNumber))
      .collect();

    return messages.map((msg: Doc<'messages'>) => ({
      id: msg.id,
      chat_id: msg.chat_id,
      user_id: msg.user_id,
      content: msg.content,
      model: msg.model,
      plugin: msg.plugin,
      role: msg.role,
      sequence_number: msg.sequence_number,
      thinking_content: msg.thinking_content,
      thinking_elapsed_secs: msg.thinking_elapsed_secs,
      image_paths: msg.image_paths,
      citations: msg.citations,
      attachments: msg.attachments || [],
      updated_at: msg.updated_at,
      created_at: msg._creationTime,
    }));
  },
});

/**
 * Internal query to get messages with feedback and file items for a chat with pagination
 */
export const internalGetMessagesWithFiles = internalQuery({
  args: {
    chatId: v.string(),
    limit: v.optional(v.number()),
    lastSequenceNumber: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id('messages'),
      _creationTime: v.number(),
      id: v.string(),
      chat_id: v.string(),
      user_id: v.string(),
      content: v.string(),
      model: v.string(),
      plugin: v.optional(v.string()),
      role: v.string(),
      sequence_number: v.number(),
      thinking_content: v.optional(v.string()),
      thinking_elapsed_secs: v.optional(v.number()),
      image_paths: v.array(v.string()),
      citations: v.array(v.string()),
      attachments: v.array(v.any()),
      updated_at: v.optional(v.number()),
      created_at: v.number(),
      feedback: v.array(
        v.object({
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
        }),
      ),
      file_items: v.array(
        v.object({
          _id: v.id('file_items'),
          _creationTime: v.number(),
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
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    // Get messages with pagination
    let messagesQuery = ctx.db
      .query('messages')
      .withIndex('by_chat_and_sequence', (q) => q.eq('chat_id', args.chatId))
      .order('desc');

    if (args.lastSequenceNumber !== undefined) {
      messagesQuery = messagesQuery.filter((q) =>
        q.lt(q.field('sequence_number'), args.lastSequenceNumber!),
      );
    }

    const messages = await messagesQuery.take(args.limit ?? 20);

    // Get feedback using the internal function
    const feedback = await ctx.runQuery(
      internal.feedback.internalGetFeedbackByChatId,
      {
        chat_id: args.chatId,
        limit: args.limit,
        last_sequence_number: args.lastSequenceNumber,
      },
    );

    // Create a map of feedback by message ID
    const feedbackMap = new Map();
    for (const fb of feedback) {
      if (!feedbackMap.has(fb.message_id)) {
        feedbackMap.set(fb.message_id, []);
      }
      feedbackMap.get(fb.message_id).push(fb);
    }

    // Get file items for these messages using the new index
    const fileItemsMap = new Map<string, any[]>();
    for (const message of messages) {
      const fileItems = await ctx.db
        .query('file_items')
        .withIndex('by_message', (q) => q.eq('message_id', message.id))
        .collect();

      fileItemsMap.set(message.id, fileItems);
    }

    // Combine messages with their feedback and file items
    return messages
      .map((msg) => ({
        _id: msg._id,
        _creationTime: msg._creationTime,
        id: msg.id,
        chat_id: msg.chat_id,
        user_id: msg.user_id,
        content: msg.content,
        model: msg.model,
        plugin: msg.plugin,
        role: msg.role,
        sequence_number: msg.sequence_number,
        thinking_content: msg.thinking_content,
        thinking_elapsed_secs: msg.thinking_elapsed_secs,
        image_paths: msg.image_paths,
        citations: msg.citations,
        attachments: msg.attachments || [],
        updated_at: msg.updated_at,
        created_at: msg._creationTime,
        feedback: feedbackMap.get(msg.id) || [],
        file_items: fileItemsMap.get(msg.id) || [],
      }))
      .reverse();
  },
});
