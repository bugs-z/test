import {
  processCSV,
  processJSON,
  processMarkdown,
  processPdf,
  processTxt,
  convert,
  TOKEN_LIMIT,
  PDF_TOKEN_LIMIT,
} from '@/lib/retrieval/processing';
import { getServerProfile } from '@/lib/server/server-chat-helpers';
import { createSupabaseAdminClient } from '@/lib/server/server-utils';
import {
  uploadFileToStorage,
  cleanupFileFromStorage,
} from '@/lib/server/file-storage';
import type { FileItemChunk } from '@/types';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const MAX_FILE_SIZE_MB = 30; // 30MB limit

export async function POST(req: Request) {
  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const supabase = await createClient();
    const profile = await getServerProfile();

    if (!profile?.user_id) {
      return new Response(
        JSON.stringify({ message: 'Unauthorized: No user profile found' }),
        { status: 401 },
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const fileRecord = JSON.parse(formData.get('fileRecord') as string);

    // Validate file
    if (!file || !(file instanceof File)) {
      return new Response(
        JSON.stringify({ message: 'Invalid file: No file provided' }),
        { status: 400 },
      );
    }

    // Validate file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      return new Response(
        JSON.stringify({
          message: `File size exceeds limit of ${MAX_FILE_SIZE_MB}MB`,
        }),
        { status: 400 },
      );
    }

    // Validate file record
    if (!fileRecord?.name || !fileRecord?.user_id) {
      return new Response(
        JSON.stringify({
          message: 'Invalid file record: Missing required fields',
        }),
        { status: 400 },
      );
    }

    const { count: filesCount, error: countError } = await supabase
      .from('files')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      throw new Error(`Failed to get file count: ${countError.message}`);
    }

    const maxFiles = Number.parseInt(
      process.env.NEXT_PUBLIC_RATELIMITER_LIMIT_FILES || '100',
    );

    if ((filesCount ?? 0) >= maxFiles) {
      return new Response(JSON.stringify({ message: 'File limit reached' }), {
        status: 400,
      });
    }

    const { data: createdFile, error: createError } = await supabase
      .from('files')
      .insert([fileRecord])
      .select('*')
      .single();

    if (createError) {
      throw new Error(`Failed to create file record: ${createError.message}`);
    }

    let filePath: string;
    filePath = await uploadFileToStorage(
      file,
      {
        name: createdFile.name,
        user_id: createdFile.user_id,
        file_id: createdFile.name,
      },
      supabase,
    );

    // Update file path in database
    const { error: updateError } = await supabase
      .from('files')
      .update({ file_path: filePath })
      .eq('id', createdFile.id);

    if (updateError) {
      // Clean up both the file record and storage if update fails
      await cleanupFileFromStorage(filePath, createdFile.id, supabase);
      throw new Error(`Failed to update file path: ${updateError.message}`);
    }

    const { data: fileMetadata, error: metadataError } = await supabaseAdmin
      .from('files')
      .select('*')
      .eq('id', createdFile.id)
      .single();

    if (metadataError) {
      await cleanupFileFromStorage(filePath, createdFile.id, supabase);
      throw new Error(
        `Failed to retrieve file metadata: ${metadataError.message}`,
      );
    }

    if (!fileMetadata) {
      await cleanupFileFromStorage(filePath, createdFile.id, supabase);
      throw new Error('File not found');
    }

    if (fileMetadata.user_id !== profile.user_id) {
      await cleanupFileFromStorage(filePath, createdFile.id, supabase);
      throw new Error('Unauthorized');
    }

    const fileExtension = fileMetadata.name.split('.').pop()?.toLowerCase();
    const blob = new Blob([await file.arrayBuffer()]);
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
        const cleanText = await convert(blob);
        chunks = await processTxt(new Blob([cleanText]));
        break;
      }
    }

    if (fileExtension !== 'pdf') {
      chunks = chunks.filter((chunk) => chunk.content.trim() !== '');
    }

    if (chunks.length === 0 && fileExtension !== 'pdf') {
      // Clean up the file record and storage if file is empty
      await cleanupFileFromStorage(filePath, createdFile.id, supabase);
      throw new Error('Empty file. Please check the file format and content.');
    }

    const totalTokens = chunks.reduce((acc, chunk) => acc + chunk.tokens, 0);
    const limit = fileExtension === 'pdf' ? PDF_TOKEN_LIMIT : TOKEN_LIMIT;
    if (totalTokens > limit) {
      // Clean up the file record and storage if token limit is exceeded
      await cleanupFileFromStorage(filePath, createdFile.id, supabase);
      throw new Error(`File content exceeds token limit of ${limit}`);
    }

    const file_items = chunks.map((chunk) => ({
      file_id: createdFile.id,
      user_id: profile.user_id,
      sequence_number: 0,
      content: chunk.content,
      tokens: chunk.tokens,
      name: fileMetadata.name,
      openai_embedding: null,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from('file_items')
      .upsert(file_items);

    if (itemsError) {
      // Clean up the file record and storage if file items creation fails
      await cleanupFileFromStorage(filePath, createdFile.id, supabase);
      throw new Error(`Failed to create file items: ${itemsError.message}`);
    }

    const { error: tokenUpdateError } = await supabaseAdmin
      .from('files')
      .update({ tokens: totalTokens })
      .eq('id', createdFile.id);

    if (tokenUpdateError) {
      // Clean up the file record, items, and storage if token update fails
      await supabaseAdmin
        .from('file_items')
        .delete()
        .eq('file_id', createdFile.id);
      await cleanupFileFromStorage(filePath, createdFile.id, supabase);
      throw new Error(
        `Failed to update token count: ${tokenUpdateError.message}`,
      );
    }

    return new NextResponse(
      JSON.stringify({
        message: 'File processing successful',
        createdFile,
      }),
      {
        status: 200,
      },
    );
  } catch (error: any) {
    console.error(`Error in file processing: ${error.stack}`);
    const errorMessage = error?.message || 'An unexpected error occurred';
    const errorCode = error.status || 500;
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode,
    });
  }
}
