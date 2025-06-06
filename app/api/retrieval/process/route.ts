import {
  processCSV,
  processJSON,
  processMarkdown,
  processPdf,
  processTxt,
  convert,
  FILE_CONTENT_TOKEN_LIMIT,
} from '@/lib/retrieval/processing';
import { getServerUser } from '@/lib/server/server-chat-helpers';
import type { FileItemChunk } from '@/types';
import { NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { isBinaryFile } from 'isbinaryfile';

if (
  !process.env.NEXT_PUBLIC_CONVEX_URL ||
  !process.env.CONVEX_SERVICE_ROLE_KEY
) {
  throw new Error(
    'NEXT_PUBLIC_CONVEX_URL or CONVEX_SERVICE_ROLE_KEY environment variable is not defined',
  );
}

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL);

export async function POST(req: Request) {
  try {
    const user = await getServerUser();
    const formData = await req.formData();
    const file_id = formData.get('file_id') as Id<'files'>;

    const fileMetadata = await convex.query(api.files.getFile, {
      fileId: file_id,
    });

    if (!fileMetadata) {
      throw new Error('File not found');
    }

    if (fileMetadata.user_id !== user.id) {
      throw new Error('Unauthorized');
    }

    // Skip legacy Supabase files (identified by "/" in file_path)
    if (fileMetadata.file_path.includes('/')) {
      throw new Error('Legacy file format not supported');
    }

    // Handle Convex storage files only
    const fileUrl = await convex.query(
      api.fileStorage.getFileStorageUrlPublic,
      {
        serviceKey: process.env.CONVEX_SERVICE_ROLE_KEY!,
        storageId: fileMetadata.file_path as Id<'_storage'>,
      },
    );

    if (!fileUrl) {
      throw new Error('Failed to get file URL from Convex storage');
    }

    // Fetch the file content from Convex storage URL
    const response = await fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch file content: ${response.statusText}`);
    }

    const fileBuffer = Buffer.from(await response.arrayBuffer());

    const blob = new Blob([fileBuffer]);
    const fileExtension = fileMetadata.name.split('.').pop()?.toLowerCase();

    let chunks: FileItemChunk[] = [];

    switch (fileExtension) {
      case 'csv':
        chunks = await processCSV(blob);
        break;
      case 'json':
        chunks = await processJSON(blob);
        break;
      case 'md':
        chunks = await processMarkdown(blob);
        break;
      case 'pdf':
        chunks = await processPdf(blob);
        break;
      case 'txt':
        chunks = await processTxt(blob);
        break;
      default: {
        // Check if the original file is binary before text conversion
        const isBinary = await isBinaryFile(fileBuffer);

        if (isBinary) {
          // For binary files, create a single chunk with empty content and 0 tokens
          chunks = [
            {
              content: '',
              tokens: 0,
            },
          ];
        } else {
          const cleanText: string = await convert(blob);
          chunks = await processTxt(new Blob([cleanText]));
        }
        break;
      }
    }

    if (fileExtension !== 'pdf') {
      // Filter out empty chunks, but preserve binary file chunks (which have empty content by design)
      chunks = chunks.filter((chunk) => {
        // Keep chunks that have content or are intentionally empty (0 tokens indicates binary file)
        return chunk.content.trim() !== '' || chunk.tokens === 0;
      });
    }

    const totalTokens = chunks.reduce((acc, chunk) => acc + chunk.tokens, 0);
    const limit = FILE_CONTENT_TOKEN_LIMIT;

    if (totalTokens > limit) {
      throw new Error(`File content exceeds token limit of ${limit}`);
    }

    const file_items = chunks.map((chunk) => ({
      file_id,
      user_id: user.id,
      sequence_number: 0,
      content: chunk.content,
      tokens: chunk.tokens,
      name: fileMetadata.name,
    }));

    const upsertResult = await convex.mutation(api.file_items.upsertFileItems, {
      serviceKey: process.env.CONVEX_SERVICE_ROLE_KEY!,
      fileItems: file_items,
    });

    if (!upsertResult.success) {
      throw new Error(upsertResult.error || 'Failed to upsert file items');
    }

    await convex.mutation(api.files.updateFile, {
      serviceKey: process.env.CONVEX_SERVICE_ROLE_KEY!,
      fileId: file_id,
      fileData: {
        tokens: totalTokens,
      },
    });

    return new NextResponse('File processing successful', {
      status: 200,
    });
  } catch (error: any) {
    // Only log stack trace for unexpected errors
    const knownErrors = ['exceeds token limit'];

    if (
      !knownErrors.some((knownError) => error.message?.includes(knownError))
    ) {
      console.error(`Error in retrieval/process: ${error.stack}`);
    }

    const errorMessage = error?.message || 'An unexpected error occurred';
    const errorCode = error.status || 500;
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode,
    });
  }
}
