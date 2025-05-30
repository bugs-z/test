import { processDocX } from '@/lib/retrieval/processing';
import { getServerProfile } from '@/lib/server/server-chat-helpers';
import type { FileItemChunk } from '@/types';
import { NextResponse } from 'next/server';
import { ConvexClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';

// Create a single instance of the Convex client
const convex = new ConvexClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export async function POST(req: Request) {
  const json = await req.json();
  const { text, fileId, fileExtension } = json as {
    text: string;
    fileId: string;
    fileExtension: string;
  };

  try {
    const profile = await getServerProfile();

    let chunks: FileItemChunk[] = [];

    switch (fileExtension) {
      case 'docx':
        chunks = await processDocX(text);
        break;
      default:
        return new NextResponse('Unsupported file type', {
          status: 400,
        });
    }

    const file_items = chunks.map((chunk) => ({
      file_id: fileId,
      user_id: profile.user_id,
      sequence_number: 0,
      content: chunk.content,
      tokens: chunk.tokens,
    }));

    await convex.mutation(api.file_items.upsertFileItems, {
      fileItems: file_items,
    });

    const totalTokens = file_items.reduce((acc, item) => acc + item.tokens, 0);

    await convex.mutation(api.files.updateFile, {
      fileId,
      fileData: {
        tokens: totalTokens,
      },
    });

    return new NextResponse('Embed Successful', {
      status: 200,
    });
  } catch (error: any) {
    console.error(error);
    const errorMessage = error.error?.message || 'An unexpected error occurred';
    const errorCode = error.status || 500;
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode,
    });
  }
}
