import { mutation, query, internalQuery } from './_generated/server';
import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import type { Id } from './_generated/dataModel';
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
    serviceKey: v.string(),
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
    imagePaths: v.optional(v.array(v.string())),
    isContinuation: v.optional(v.boolean()),
    isTerminalContinuation: v.optional(v.boolean()),
    editSequenceNumber: v.optional(v.number()),
    assistantMessageId: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    messageId: v.optional(v.id('messages')),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    // Verify service role key
    if (args.serviceKey !== process.env.CONVEX_SERVICE_ROLE_KEY) {
      return {
        success: false,
        error: 'Unauthorized: Invalid service key',
      };
    }

    try {
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
        imagePaths,
        isContinuation,
        isTerminalContinuation,
        editSequenceNumber,
        assistantMessageId,
      } = args;

      // If this is a continuation, update the last assistant message
      if (isContinuation || isTerminalContinuation) {
        const lastAssistantMessage = await ctx.db
          .query('messages')
          .withIndex('by_chat_id', (q) => q.eq('chat_id', chatId))
          .filter((q) => q.eq(q.field('role'), 'assistant'))
          .order('desc')
          .first();

        if (!lastAssistantMessage) {
          return {
            success: false,
            error: 'No assistant message found to continue',
          };
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
          image_paths: [
            ...(lastAssistantMessage.image_paths || []),
            ...(imagePaths || []),
          ],
          updated_at: Date.now(),
        });

        return {
          success: true,
          messageId: lastAssistantMessage._id,
        };
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
        image_paths: imagePaths || [],
      });

      return {
        success: true,
        messageId,
      };
    } catch (error) {
      console.error('Error saving assistant message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

/**
 * Delete the last message in a chat
 */
export const deleteLastMessage = mutation({
  args: {
    serviceKey: v.string(),
    chatId: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    // Verify service role key
    if (args.serviceKey !== process.env.CONVEX_SERVICE_ROLE_KEY) {
      return {
        success: false,
        error: 'Unauthorized: Invalid service key',
      };
    }

    try {
      const lastMessage = await ctx.db
        .query('messages')
        .withIndex('by_chat_id', (q) => q.eq('chat_id', args.chatId))
        .order('desc')
        .first();

      if (!lastMessage) {
        return {
          success: false,
          error: 'No message found to delete',
        };
      }

      // Delete images from storage using image_paths
      if (lastMessage.image_paths && lastMessage.image_paths.length > 0) {
        for (const imagePath of lastMessage.image_paths) {
          await ctx.runMutation(
            internal.fileStorage.deleteFileAndAssociatedData,
            {
              storageId: imagePath as Id<'_storage'>,
            },
          );
        }
      }

      // Delete files from storage using attachments
      if (lastMessage.attachments && lastMessage.attachments.length > 0) {
        for (const attachment of lastMessage.attachments) {
          await ctx.runMutation(
            internal.fileStorage.deleteFileAndAssociatedData,
            {
              fileId: attachment.id,
              storageId: attachment.url as Id<'_storage'>,
            },
          );
        }
      }

      // Delete the message from database
      await ctx.db.delete(lastMessage._id);
      return { success: true };
    } catch (error) {
      console.error('Error deleting last message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

/**
 * Delete messages including and after a specific sequence number
 */
export const deleteMessagesIncludingAndAfter = mutation({
  args: {
    serviceKey: v.string(),
    chatId: v.string(),
    sequenceNumber: v.number(),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    // Verify service role key
    if (args.serviceKey !== process.env.CONVEX_SERVICE_ROLE_KEY) {
      return {
        success: false,
        error: 'Unauthorized: Invalid service key',
      };
    }

    try {
      const messagesToDelete = await ctx.db
        .query('messages')
        .withIndex('by_chat_and_sequence', (q) => q.eq('chat_id', args.chatId))
        .filter((q) => q.gte(q.field('sequence_number'), args.sequenceNumber))
        .collect();

      // Delete associated images and files before deleting messages
      for (const message of messagesToDelete) {
        // Delete images from storage using image_paths
        if (message.image_paths && message.image_paths.length > 0) {
          for (const imagePath of message.image_paths) {
            await ctx.runMutation(
              internal.fileStorage.deleteFileAndAssociatedData,
              {
                storageId: imagePath as Id<'_storage'>,
              },
            );
          }
        }

        // Delete files that have message_id matching this message
        const filesWithMessageId = await ctx.db
          .query('files')
          .withIndex('by_message_id', (q) => q.eq('message_id', message.id))
          .collect();

        for (const file of filesWithMessageId) {
          await ctx.runMutation(
            internal.fileStorage.deleteFileAndAssociatedData,
            {
              fileId: file._id,
              storageId: file.file_path as Id<'_storage'>,
              identifier: file.file_path,
            },
          );
        }

        // Delete files from storage using attachments
        if (message.attachments && message.attachments.length > 0) {
          for (const attachment of message.attachments) {
            await ctx.runMutation(
              internal.fileStorage.deleteFileAndAssociatedData,
              {
                fileId: attachment.id,
                storageId: attachment.url as Id<'_storage'>,
                identifier: attachment.url,
              },
            );
          }
        }

        // Delete the message from database
        await ctx.db.delete(message._id);
      }

      return { success: true };
    } catch (error) {
      console.error('Error deleting messages:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

/**
 * Insert a single message
 */
export const insertMessage = mutation({
  args: {
    serviceKey: v.string(),
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
  returns: v.object({
    success: v.boolean(),
    messageId: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    // Verify service role key
    if (args.serviceKey !== process.env.CONVEX_SERVICE_ROLE_KEY) {
      return {
        success: false,
        error: 'Unauthorized: Invalid service key',
      };
    }

    try {
      await ctx.db.insert('messages', {
        ...args.message,
        updated_at: Date.now(),
      });
      return {
        success: true,
        messageId: args.message.id,
      };
    } catch (error) {
      console.error('Error inserting message:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

/**
 * Internal query to get message at a specific sequence number
 */
export const internalGetMessageAtSequence = internalQuery({
  args: {
    chatId: v.string(),
    sequenceNumber: v.number(),
  },
  returns: v.union(
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
    v.null(),
  ),
  handler: async (ctx, args: { chatId: string; sequenceNumber: number }) => {
    const message = await ctx.db
      .query('messages')
      .withIndex('by_chat_and_sequence', (q) =>
        q.eq('chat_id', args.chatId).eq('sequence_number', args.sequenceNumber),
      )
      .first();

    if (!message) {
      return null;
    }

    return {
      id: message.id,
      chat_id: message.chat_id,
      user_id: message.user_id,
      content: message.content,
      model: message.model,
      plugin: message.plugin,
      role: message.role,
      sequence_number: message.sequence_number,
      thinking_content: message.thinking_content,
      thinking_elapsed_secs: message.thinking_elapsed_secs,
      image_paths: message.image_paths,
      citations: message.citations,
      attachments: message.attachments || [],
      updated_at: message.updated_at,
      created_at: message._creationTime,
    };
  },
});

/**
 * Search messages across all chats for a user
 */
export const internalSearchMessages = internalQuery({
  args: {
    userId: v.string(),
    searchQuery: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(
      v.object({
        id: v.string(),
        chat_id: v.string(),
        content: v.string(),
        created_at: v.number(),
        updated_at: v.optional(v.number()),
        chat_name: v.optional(v.string()),
      }),
    ),
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    if (!args.searchQuery.trim()) {
      return {
        page: [],
        isDone: true,
        continueCursor: null,
      };
    }

    // Search messages using the full text search index
    const searchResults = await ctx.db
      .query('messages')
      .withSearchIndex('search_content', (q) =>
        q.search('content', args.searchQuery).eq('user_id', args.userId),
      )
      .paginate(args.paginationOpts);

    // Get chat names for the messages
    const chatIds = [...new Set(searchResults.page.map((msg) => msg.chat_id))];
    const chats = await Promise.all(
      chatIds.map(async (chatId) => {
        const chat = await ctx.db
          .query('chats')
          .withIndex('by_chat_id', (q) => q.eq('id', chatId))
          .first();
        return { chatId, name: chat?.name };
      }),
    );

    const chatNameMap = new Map(chats.map((chat) => [chat.chatId, chat.name]));

    // Format the results with only essential fields
    const processedMessages = searchResults.page.map((msg) => ({
      id: msg.id,
      chat_id: msg.chat_id,
      content: msg.content,
      created_at: msg._creationTime,
      updated_at: msg.updated_at,
      chat_name: chatNameMap.get(msg.chat_id),
    }));

    return {
      page: processedMessages,
      isDone: searchResults.isDone,
      continueCursor: searchResults.continueCursor,
    };
  },
});

/**
 * Internal query to get messages with feedback and file items for a chat with pagination
 */
export const internalGetMessagesWithFiles = internalQuery({
  args: {
    chatId: v.string(),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({
    page: v.array(
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
    isDone: v.boolean(),
    continueCursor: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    // Get messages using pagination
    const paginationResult = await ctx.db
      .query('messages')
      .withIndex('by_chat_and_sequence', (q) => q.eq('chat_id', args.chatId))
      .order('desc')
      .paginate(args.paginationOpts);

    const messages = paginationResult.page;

    if (messages.length === 0) {
      return {
        page: [],
        isDone: paginationResult.isDone,
        continueCursor: paginationResult.continueCursor,
      };
    }

    // Extract message IDs for batch operations
    const messageIds = messages.map((msg) => msg.id);

    // Batch fetch feedback and file items in parallel
    const [feedbackResults, fileItemsResults] = await Promise.all([
      // Get all feedback for this chat in one query, then filter in memory
      ctx.db
        .query('feedback')
        .withIndex('by_chat_and_sequence', (q) => q.eq('chat_id', args.chatId))
        .collect(),

      // Get all file items for this chat in one query using chat_id
      ctx.db
        .query('file_items')
        .withIndex('by_chat_id', (q) => q.eq('chat_id', args.chatId))
        .collect(),
    ]);

    // Create lookup maps for O(1) access instead of multiple queries
    const feedbackMap = new Map<string, any[]>();
    const fileItemsMap = new Map<string, any[]>();

    // Build feedback map - group by message_id
    for (const fb of feedbackResults) {
      if (messageIds.includes(fb.message_id)) {
        if (!feedbackMap.has(fb.message_id)) {
          feedbackMap.set(fb.message_id, []);
        }
        feedbackMap.get(fb.message_id)?.push({
          message_id: fb.message_id,
          user_id: fb.user_id,
          chat_id: fb.chat_id,
          feedback: fb.feedback,
          reason: fb.reason,
          detailed_feedback: fb.detailed_feedback,
          model: fb.model,
          updated_at: fb.updated_at,
          sequence_number: fb.sequence_number,
          allow_email: fb.allow_email,
          allow_sharing: fb.allow_sharing,
          has_files: fb.has_files,
          plugin: fb.plugin,
        });
      }
    }

    // Build file items map - group by message_id
    for (const fileItem of fileItemsResults) {
      if (fileItem.message_id && messageIds.includes(fileItem.message_id)) {
        if (!fileItemsMap.has(fileItem.message_id)) {
          fileItemsMap.set(fileItem.message_id, []);
        }
        fileItemsMap.get(fileItem.message_id)?.push({
          _id: fileItem._id,
          _creationTime: fileItem._creationTime,
          file_id: fileItem.file_id,
          user_id: fileItem.user_id,
          content: fileItem.content,
          tokens: fileItem.tokens,
          name: fileItem.name,
          sequence_number: fileItem.sequence_number,
          updated_at: fileItem.updated_at,
          message_id: fileItem.message_id,
          chat_id: fileItem.chat_id,
        });
      }
    }

    // Single pass to combine all data
    const processedMessages = messages.map((msg) => ({
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
    }));

    return {
      page: processedMessages.reverse(),
      isDone: paginationResult.isDone,
      continueCursor: paginationResult.continueCursor,
    };
  },
});
