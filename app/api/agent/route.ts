import { getAIProfile } from '@/lib/server/server-chat-helpers';
import { handleErrorResponse } from '@/lib/models/api-error';
import { checkRatelimitOnApi } from '@/lib/server/ratelimiter';
import { createDataStreamResponse } from 'ai';
import { executePentestAgent } from '@/lib/ai/tools/pentest-agent';
import { createClient } from '@/lib/supabase/server';
import { processChatMessages } from '@/lib/ai/message-utils';

export const maxDuration = 800;

export async function POST(request: Request) {
  const abortController = new AbortController();

  request.signal.addEventListener('abort', () => {
    console.log('request aborted');
    abortController.abort();
  });

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

    const supabase = await createClient();

    const { processedMessages, systemPrompt, pentestFiles } =
      await processChatMessages(
        messages,
        'chat-model-agent',
        modelParams,
        true,
        profile,
        false,
        supabase,
        true,
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
            modelParams,
            profile,
            dataStream,
            abortSignal: request.signal,
            chatMetadata,
            model,
            supabase,
            userCountryCode,
            originalMessages: messages,
            systemPrompt,
            pentestFiles,
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
