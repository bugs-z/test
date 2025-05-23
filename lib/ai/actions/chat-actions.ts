import type { LLMID } from '@/types';
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
  content,
  finishReason,
  newChat,
  title,
}: {
  supabase: SupabaseClient;
  chatId: string;
  userId: string;
  model: LLMID;
  content: string;
  finishReason: string;
  newChat: boolean;
  title?: string;
}) {
  try {
    const { data: _, error } = await supabase
      .from('chats')
      .update({
        ...(newChat && title ? { name: title } : {}),
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
