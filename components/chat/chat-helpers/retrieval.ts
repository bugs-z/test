import { Tables } from "@/supabase/types"

export const handleRetrieval = async (
  conversationHistory: string,
  newMessageFiles: Tables<"files">[],
  chatFiles: Tables<"files">[],
  sourceCount: number
) => {
  const response = await fetch("/api/retrieval/retrieve", {
    method: "POST",
    body: JSON.stringify({
      conversationHistory,
      newMessageFiles: newMessageFiles.map(file => file.id),
      chatFiles: chatFiles.map(file => file.id),
      sourceCount
    })
  })

  if (!response.ok) {
    console.error("Error retrieving:", response)
  }

  const { chunks } = (await response.json()) as {
    chunks: string[]
  }

  return { chunks }
}
