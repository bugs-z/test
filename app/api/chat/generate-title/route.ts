import { checkRatelimitOnApi } from "@/lib/server/ratelimiter"
import { getAIProfile } from "@/lib/server/server-chat-helpers"
import { generateObject } from "ai"
import { DEFAULT_TITLE_GENERATION_PROMPT_TEMPLATE } from "@/lib/backend-config"
import { z } from "zod"
import { myProvider } from "@/lib/ai/providers"

export const runtime = "edge"

export async function POST(request: Request) {
  try {
    const { messages } = await request.json()

    // Get user profile and check rate limit
    const profile = await getAIProfile()
    const rateLimitCheckResult = await checkRatelimitOnApi(
      profile.user_id,
      "generate-title"
    )
    if (rateLimitCheckResult !== null) {
      return rateLimitCheckResult.response
    }

    console.log("Generating chat title for user", profile.user_id)

    const simplifiedMessages = messages.slice(-2)

    const {
      object: { title }
    } = await generateObject({
      model: myProvider.languageModel("title-model"),
      schema: z.object({
        title: z.string().describe("The generated title (3-5 words)")
      }),
      messages: [
        {
          role: "user",
          content: DEFAULT_TITLE_GENERATION_PROMPT_TEMPLATE(simplifiedMessages)
        }
      ],
      abortSignal: request.signal,
      maxTokens: 50
    })

    return new Response(JSON.stringify({ name: title }), {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    })
  } catch (error: any) {
    console.error("Error generating chat name:", error)
    return new Response(
      JSON.stringify({ message: "Failed to generate chat name" }),
      { status: 500 }
    )
  }
}
