import { tool } from 'ai';
import { z } from 'zod';
import { experimental_generateImage as generateImage } from 'ai';
import { openai } from '@ai-sdk/openai';
import PostHogClient from '@/app/posthog';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { checkRatelimitOnApi } from '@/lib/server/ratelimiter';

/**
 * Interface for image generation parameters
 */
interface ImageGenerationParameters {
  prompt: string;
  size: '1024x1024' | '1536x1024' | '1024x1536';
  n?: number;
  transparent_background?: boolean;
}

/**
 * Image generation tool using Vercel's AI SDK with OpenAI's image model
 * Generates images from descriptions
 */
export const createImageGenTool = (
  profile: any,
  abortSignal: AbortSignal,
  dataStream: any,
) => {
  return tool({
    description: `The image_gen tool enables image generation from descriptions. Use it when:
- The user requests an image based on a scene description, such as a diagram, portrait, comic, meme, or any other visual.

Limitations:
- Image editing is not currently supported but will be available soon when the tool can see and manipulate generated images.
- Creating images that include renditions of the user is not currently supported but will be available soon when the tool can see and manipulate generated images.

Guidelines:
- After each image generation, do not mention anything related to download. Do not summarize the image. Do not ask followup question. Do not say ANYTHING after you generate an image.`,
    parameters: z.object({
      prompt: z
        .string()
        .describe('A detailed text description of the image to generate'),
      size: z
        .enum(['1024x1024', '1536x1024', '1024x1536'])
        .nullable()
        .describe('The size of the generated image. Default is 1024x1024.'),
      n: z
        .number()
        .min(1)
        .max(4)
        .nullable()
        .describe(
          'The number of images to generate (max usually 1–4). Default is 1.',
        ),
      transparent_background: z
        .boolean()
        .nullable()
        .describe(
          'Whether to generate the image with a transparent background. Default is false.',
        ),
    }),
    execute: async ({
      prompt,
      size = '1024x1024',
      n = 1,
      transparent_background = false,
    }) => {
      try {
        const rateLimitStatus = await checkRatelimitOnApi(
          profile.user_id,
          'image-gen',
        );

        if (!rateLimitStatus.allowed) {
          dataStream.writeData({
            type: 'error',
            content: {
              type: 'ratelimit_hit',
              message: `Rate limit exceeded for image generation. ${rateLimitStatus.info.message}`,
              rateLimitInfo: rateLimitStatus.info,
            },
          });

          return {
            success: false,
            error: `Rate limit exceeded for image generation. ${rateLimitStatus.info.message}`,
            rateLimitInfo: rateLimitStatus.info,
          };
        }
      } catch (error) {
        return {
          success: false,
          error: 'Failed to check rate limit for image generation',
        };
      }

      const parametersJson: ImageGenerationParameters = {
        prompt,
        size: size ?? '1024x1024',
      };
      if (n !== null && n !== 1) parametersJson.n = n;
      if (transparent_background === true)
        parametersJson.transparent_background = transparent_background;

      try {
        const posthog = PostHogClient();
        posthog?.capture({
          distinctId: profile.user_id,
          event: 'image_generation_executed',
        });

        const providerOptions: any = {};
        if (transparent_background) {
          providerOptions.openai.background = 'transparent';
        }

        const result = await generateImage({
          model: openai.image('gpt-image-1'),
          prompt,
          size: size as '1024x1024' | '1536x1024' | '1024x1536',
          n: n || undefined,
          providerOptions,
          abortSignal,
        });

        if (
          !process.env.NEXT_PUBLIC_CONVEX_URL ||
          !process.env.CONVEX_SERVICE_ROLE_KEY
        ) {
          throw new Error('Convex environment variables are not configured');
        }

        const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);
        const images = result.images || (result.image ? [result.image] : []);

        const savedImages = await Promise.all(
          images.map(async (image: any, index: number) => {
            const base64Data = image.base64;
            if (!base64Data) {
              throw new Error('No image data received');
            }

            const base64String = base64Data.replace(
              /^data:image\/[a-z]+;base64,/,
              '',
            );
            const imageBuffer = Buffer.from(base64String, 'base64');
            const blob = new Blob([imageBuffer], { type: 'image/png' });

            const uploadUrl = await convex.mutation(
              api.fileStorage.generateUploadUrl,
              {
                serviceKey: process.env.CONVEX_SERVICE_ROLE_KEY!,
              },
            );

            if (!uploadUrl) {
              throw new Error('Failed to generate upload URL');
            }

            const uploadResult = await fetch(uploadUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'image/png' },
              body: blob,
            });

            if (!uploadResult.ok) {
              throw new Error('Failed to upload image to storage');
            }

            const { storageId } = await uploadResult.json();

            const storageUrl = await convex.query(
              api.fileStorage.getFileStorageUrlPublic,
              {
                serviceKey: process.env.CONVEX_SERVICE_ROLE_KEY!,
                storageId: storageId as Id<'_storage'>,
              },
            );

            return {
              storageId: storageId as Id<'_storage'>,
              storageUrl: storageUrl,
              b64_json: base64String,
              size: blob.size,
              index,
            };
          }),
        );

        dataStream.writeData({
          type: 'assistant-images',
          content: savedImages.map((img) => img.storageUrl),
          imagePaths: savedImages.map((img) => img.storageId.toString()),
        });

        return {
          success: true,
          message: `PentestGPT returned ${savedImages.length} image${savedImages.length > 1 ? 's' : ''}. From now on, do not say or show ANYTHING. Please end this turn now. I repeat: From now on, do not say or show ANYTHING. Please end this turn now. Do not summarize the image. Do not ask followup question. Just end the turn and do not do anything else.`,
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error occurred';
        return {
          success: false,
          error: `Error generating image: ${errorMessage}`,
        };
      }
    },
  });
};

export default createImageGenTool;
