import { getAIProfile } from '@/lib/server/server-chat-helpers';
import { handleErrorResponse } from '@/lib/models/api-error';
import { checkRatelimitOnApi } from '@/lib/server/ratelimiter';
import { createDataStreamResponse } from 'ai';
import { executePentestAgent } from '@/lib/ai/tools/pentest-agent';
import { createClient } from '@/lib/supabase/server';
import { processChatMessages } from '@/lib/ai/message-utils';
import { postRequestBodySchema, type PostRequestBody } from '../chat/schema';
import { ChatSDKError } from '@/lib/errors';

export const maxDuration = 800;

export async function POST(request: Request) {
  const abortController = new AbortController();
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (_) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const userCountryCode = request.headers.get('x-vercel-ip-country');
    const { messages, model, modelParams, chatMetadata } = requestBody;

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
            abortSignal: abortController.signal,
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
