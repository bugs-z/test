import llmConfig from "@/lib/models/llm/llm-config"
import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { Database, Tables } from "@/supabase/types"
import { createClient, SupabaseClient } from "@supabase/supabase-js"
import OpenAI from "openai"
import { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs"
import { z } from "zod"
import { zodResponseFormat } from "openai/helpers/zod"

const MINIMUM_SIMILARITY = 0
const CHUNKS_PER_QUERY = 8
const MAXIMUM_OUTPUT_CHUNKS = 16

type FileItems =
  Database["public"]["Functions"]["match_file_items_openai"]["Returns"]

const cosineSimilarity = (embedding1: number[], embedding2: number[]) => {
  const dotProduct = embedding1.reduce(
    (acc, val, index) => acc + val * embedding2[index],
    0
  )
  const magnitude1 = Math.sqrt(
    embedding1.reduce((acc, val) => acc + val * val, 0)
  )
  const magnitude2 = Math.sqrt(
    embedding2.reduce((acc, val) => acc + val * val, 0)
  )
  return dotProduct / (magnitude1 * magnitude2)
}

const handleRetrieval = async (
  openai: OpenAI,
  supabaseAdmin: SupabaseClient,
  fileId: string,
  query: string,
  keywords: string[]
): Promise<FileItems> => {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query
  })

  let fileItemsToAnalyze: Tables<"file_items">[] = []

  if (keywords.length > 0) {
    const { data: keywordsSearch, error: keywordsSearchError } =
      await supabaseAdmin
        .from("file_items")
        .select("*")
        .in("file_id", [fileId])
        .or(`content.ilike.%${keywords.join("%,content.ilike.%")}%`)

    if (keywordsSearchError) {
      throw new Error(
        `Failed to retrieve keywords search: ${keywordsSearchError.message}`
      )
    }

    if (keywordsSearch.length < CHUNKS_PER_QUERY && keywordsSearch.length > 0) {
      return keywordsSearch.map(item => ({
        id: item.id,
        file_id: item.file_id,
        content: item.content,
        tokens: item.tokens,
        similarity: 1
      }))
    }

    fileItemsToAnalyze = keywordsSearch
  }

  const openaiEmbedding = response.data.map(item => item.embedding)[0]

  if (fileItemsToAnalyze.length > 0) {
    const cosineSimilarities = fileItemsToAnalyze.map(item => {
      const embedding = JSON.parse(item.openai_embedding || "[]") as number[]
      return {
        id: item.id,
        file_id: item.file_id,
        content: item.content,
        tokens: item.tokens,
        similarity: cosineSimilarity(openaiEmbedding, embedding)
      }
    })

    return cosineSimilarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, CHUNKS_PER_QUERY)
  }

  const { data: openaiFileItems } = (await supabaseAdmin.rpc(
    "match_file_items_openai",
    {
      query_embedding: openaiEmbedding as any,
      match_count: CHUNKS_PER_QUERY,
      file_ids: [fileId]
    }
  )) as {
    data: FileItems
  }

  return openaiFileItems.filter(item => item.similarity > MINIMUM_SIMILARITY)
}

const handleQueryFiles =
  (openai: OpenAI, supabaseAdmin: SupabaseClient, chunks: FileItems) =>
  async (inputString: string) => {
    const request = JSON.parse(inputString) as {
      queries: {
        file_id: string
        query_for_semantic_search: string
        keywords: string[]
      }[]
    }

    const results = await Promise.all(
      request.queries.map(async queryPair => {
        const { file_id, query_for_semantic_search, keywords } = queryPair
        return handleRetrieval(
          openai,
          supabaseAdmin,
          file_id,
          query_for_semantic_search,
          keywords
        )
      })
    )

    chunks.push(...results.flat())

    return `<results>\n${results
      .flat()
      .map(
        result =>
          `<result chunk_id="${result.id}">\n${result.content}\n</result>`
      )}\n</results>`
  }

const queryFilesTool = (
  openai: OpenAI,
  supabaseAdmin: SupabaseClient,
  chunks: FileItems
) => ({
  type: "function" as const,
  function: {
    name: "queryFiles",
    description: "Query the files for the answer to the question",
    parameters: {
      type: "object",
      properties: {
        queries: {
          type: "array",
          items: {
            type: "object",
            properties: {
              file_id: { type: "string" },
              query_for_semantic_search: {
                type: "string",
                description:
                  "An atomic query contextualized to the file. This should be a single question that can be answered with the content of the file."
              },
              keywords: {
                type: "array",
                items: { type: "string" },
                description:
                  "A list of keywords that MUST be present in the file. If multiple keywords are provided, at least ONE of them must be present (OR condition). Leave this array empty if you don't need to filter by specific keywords."
              }
            },
            required: ["file_id", "query_for_semantic_search", "keywords"]
          }
        }
      },
      required: ["queries"]
    },
    function: async (args: any) =>
      handleQueryFiles(openai, supabaseAdmin, chunks)(args)
  }
})

export async function POST(request: Request) {
  const json = await request.json()
  const { conversationHistory, newMessageFiles, chatFiles } = json as {
    conversationHistory: string
    newMessageFiles: string[]
    chatFiles: string[]
  }

  const uniqueFileIds = [...new Set([...newMessageFiles, ...chatFiles])]

  try {
    const supabaseAdmin = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const profile = await getServerProfile()

    const { data: userFiles, error: userFilesError } = await supabaseAdmin
      .from("files")
      .select("id, name")
      .in("id", uniqueFileIds)
      .eq("user_id", profile.user_id)

    if (userFilesError) {
      throw new Error(
        `Failed to retrieve user files: ${userFilesError.message}`
      )
    }

    if (userFiles.length !== uniqueFileIds.length) {
      throw new Error("One or more files are not accessible by the user")
    }

    const openai = new OpenAI({
      apiKey: llmConfig.openai.apiKey
    })

    const chunks: FileItems = []

    const messages: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: `You are a helpful researcher that will determine if the user's question is related to the files they've uploaded. Retrieve file chunks if:
          1. The question is directly asking about file content
          2. The question requires information from the files to answer properly
          3. The user wants to use the files with terminal commands or tools/plugins
          4. The user mentions uploading or processing files

          Here are the files available: <files>\n${userFiles
            .map(file => `File ID: ${file.id} - Name: ${file.name}`)
            .join("\n")}\n</files>
          
          If the user's question involves using files with terminal commands, tools, or plugins, you should return relevant chunk_ids to make the file content available to those tools.`
      }
    ]

    messages.push({
      role: "user",
      content: `This is the conversation history:\n\n${conversationHistory}`
    })

    if (newMessageFiles.length > 0) {
      messages.push({
        role: "user",
        content: `The user attached specifically the following file to the last message: ${JSON.stringify(
          newMessageFiles
        )}`
      })
    }

    messages.push({
      role: "user",
      content: `Analyze the conversation and determine if the user's latest question is related to the files. If it is, use the queryFiles tool to find relevant chunks. 
      
      IMPORTANT: If the user wants to upload, process, or use files with terminal commands or plugins, consider this as requiring file content and return the relevant chunk_ids. 
      
      Only return an empty array for chunk_ids if the question has absolutely no relation to files.`
    })

    const runner = openai.beta.chat.completions.runTools({
      model: "gpt-4o-mini",
      messages: messages,
      tools: [queryFilesTool(openai, supabaseAdmin, chunks)],
      response_format: zodResponseFormat(
        z.object({
          reasoning: z
            .string()
            .describe(
              "A brief and concise reasoning for whether the query is related to files and why specific chunk_ids were selected or not."
            ),
          chunk_ids: z
            .array(z.string())
            .describe(
              `A list of the most relevant chunk_ids. Maximum ${MAXIMUM_OUTPUT_CHUNKS} chunk_ids. Return an empty array if the query is not related to files.`
            )
        }),
        "chunkIds"
      ),
      tool_choice: "auto"
    })

    const finalResponse = await runner.finalContent()
    const parsedResponse = JSON.parse(finalResponse || '{"chunk_ids": []}') as {
      reasoning: string
      chunk_ids: string[]
    }

    return new Response(
      JSON.stringify({
        chunks: parsedResponse.chunk_ids
      }),
      {
        status: 200
      }
    )
  } catch (error: any) {
    console.error(error)
    const errorMessage = error.error?.message || "An unexpected error occurred"
    const errorCode = error.status || 500
    return new Response(JSON.stringify({ message: errorMessage }), {
      status: errorCode
    })
  }
}
