import { generateObject } from 'ai';
import { myProvider } from './providers';
import { DEFAULT_TITLE_GENERATION_PROMPT_TEMPLATE } from './prompts';
import { extractTextContent } from './message-utils';
import { z } from 'zod';
import type { BuiltChatMessage, LLMID, ChatMetadata } from '@/types';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function createChat({
  supabase,
  chatId,
  userId,
  model,
  title,
  content,
  finishReason,
}: {
  supabase: SupabaseClient;
  chatId: string;
  userId: string;
  model: LLMID;
  content: string;
  finishReason: string;
  title?: string;
}) {
  try {
    const { data: _, error } = await supabase
      .from('chats')
      .insert([
        {
          id: chatId,
          user_id: userId,
          include_profile_context: true,
          model,
          name: title || content.substring(0, 100),
          finish_reason: finishReason,
        },
      ])
      .select('*')
      .single();

    if (error) {
      // If it's a duplicate key error, update instead
      if (error.code === '23505') {
        const { error: updateError } = await supabase
          .from('chats')
          .update({
            updated_at: new Date().toISOString(),
            finish_reason: finishReason,
            model,
          })
          .eq('id', chatId);

        if (updateError) {
          console.error('Error updating chat:', updateError);
        }
        return;
      }

      console.error('Error creating chat:', error);
      return;
    }
  } catch (error) {
    console.error('Error creating chat:', error);
  }
}

export async function updateChat({
  supabase,
  chatId,
  userId,
  model,
  title,
  content,
  finishReason,
}: {
  supabase: SupabaseClient;
  chatId: string;
  userId: string;
  model: LLMID;
  finishReason: string;
  content: string;
  title?: string;
}) {
  try {
    const { data: _, error } = await supabase
      .from('chats')
      .update({
        updated_at: new Date().toISOString(),
        finish_reason: finishReason,
        model,
      })
      .eq('id', chatId)
      .select('*')
      .single();

    if (error) {
      // If the chat doesn't exist (PGRST116), create it instead
      if (error.code === 'PGRST116') {
        const { error: createError } = await supabase
          .from('chats')
          .insert([
            {
              id: chatId,
              user_id: userId,
              include_profile_context: true,
              model,
              name: title || content.substring(0, 100),
              finish_reason: finishReason,
            },
          ])
          .select('*')
          .single();

        if (createError) {
          console.error(
            'Error creating chat after update failed:',
            createError.message,
          );
        }
        return;
      }

      console.error('Error updating chat:', error);
      return;
    }
  } catch (error) {
    console.error('Error updating chat:', error);
  }
}

export async function generateTitleFromUserMessage({
  messages,
  abortSignal,
}: {
  messages: BuiltChatMessage[];
  abortSignal: AbortSignal;
}) {
  try {
    const message =
      messages.find((m: { role: string }) => m.role === 'user') ||
      messages[messages.length - 1];
    const textContent = extractTextContent(message.content);

    const {
      object: { title },
    } = await generateObject({
      model: myProvider.languageModel('chat-model-small'),
      schema: z.object({
        title: z.string().describe('The generated title (3-5 words)'),
      }),
      messages: [
        {
          role: 'user',
          content: DEFAULT_TITLE_GENERATION_PROMPT_TEMPLATE(textContent),
        },
      ],
      abortSignal,
      maxTokens: 50,
    });

    return title;
  } catch (error) {
    console.error('[Title Generation] Error:', error);
    // Return a fallback title based on the first message content
    const message =
      messages.find((m: { role: string }) => m.role === 'user') ||
      messages[messages.length - 1];
    const textContent = extractTextContent(message.content);
    return textContent.substring(0, 100).trim();
  }
}

export async function handleChatWithMetadata({
  supabase,
  chatMetadata,
  profile,
  model,
  title,
  messages,
  finishReason,
}: {
  supabase: SupabaseClient;
  chatMetadata: ChatMetadata;
  profile: { user_id: string };
  model: LLMID;
  title?: string;
  messages: any[];
  finishReason: string;
}) {
  if (!chatMetadata.id) return;

  const content = extractTextContent(messages[messages.length - 1].content);

  if (chatMetadata.newChat) {
    await createChat({
      supabase,
      chatId: chatMetadata.id,
      userId: profile.user_id,
      model,
      title,
      content,
      finishReason,
    });
  } else {
    await updateChat({
      supabase,
      chatId: chatMetadata.id,
      userId: profile.user_id,
      model,
      title,
      content,
      finishReason,
    });
  }
}
