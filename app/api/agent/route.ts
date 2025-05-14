import { getAIProfile } from '@/lib/server/server-chat-helpers';
import { handleErrorResponse } from '@/lib/models/api-error';
import { checkRatelimitOnApi } from '@/lib/server/ratelimiter';
import { createDataStreamResponse } from 'ai';
import { executePentestAgent } from '@/lib/ai/tools/pentest-agent';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { processChatMessages } from '@/lib/ai/message-utils';

export const maxDuration = 600;

export const preferredRegion = [
  'iad1',
  'arn1',
  'bom1',
  'cdg1',
  'cle1',
  'cpt1',
  'dub1',
  'fra1',
  'gru1',
  'hnd1',
  'icn1',
  'kix1',
  'lhr1',
  'pdx1',
  'sfo1',
  'sin1',
  'syd1',
];

export async function POST(request: Request) {
  try {
    const userCountryCode = request.headers.get('x-vercel-ip-country');
    const { messages, model, modelParams, chatMetadata } = await request.json();

    const profile = await getAIProfile();
    const config = await getProviderConfig(profile);

    if (!config.isRateLimitAllowed) {
      return new Response(
        JSON.stringify({
          error: {
            type: 'ratelimit_hit',
            message: config.rateLimitInfo.message,
            isPremiumUser: config.isPremiumUser,
          },
        }),
        { status: 429 },
      );
    }

    let supabase: SupabaseClient | null = null;
    supabase = await createClient();

    const { processedMessages } = await processChatMessages(
      messages,
      'chat-model-large-with-tools',
      modelParams,
      true,
      profile,
      false,
      supabase,
      true,
    );

    return createDataStreamResponse({
      execute: async (dataStream) => {
        dataStream.writeData({
          type: 'ratelimit',
          content: config.rateLimitInfo,
        });

        await executePentestAgent({
          config: {
            messages: processedMessages,
            profile,
            dataStream,
            agentMode: modelParams.agentMode,
            confirmTerminalCommand: modelParams.confirmTerminalCommand,
            abortSignal: request.signal,
            chatMetadata,
            model,
            supabase,
            isPremiumUser: config.isPremiumUser,
            userCountryCode,
            isAgentAPI: true,
            originalMessages: messages,
          },
        });
      },
    });
  } catch (error: any) {
    return handleErrorResponse(error);
  }
}

async function getProviderConfig(profile: any) {
  const rateLimitStatus = await checkRatelimitOnApi(
    profile.user_id,
    'terminal',
  );

  return {
    isRateLimitAllowed: rateLimitStatus.allowed,
    rateLimitInfo: rateLimitStatus.info,
    isPremiumUser: rateLimitStatus.info.isPremiumUser,
  };
}
