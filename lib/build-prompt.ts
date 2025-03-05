import {
  BuiltChatMessage,
  ChatMessage,
  ChatPayload,
  MessageImage,
  MessageContent
} from "@/types"
import { Tables } from "@/supabase/types"
import { countTokens } from "gpt-tokenizer"
import { GPT4o } from "./models/llm/openai-llm-list"
import { SmallModel, LargeModel } from "./models/llm/hackerai-llm-list"
import { toast } from "sonner"
import { Fragment } from "./tools/e2b/fragments/types"

export async function buildFinalMessages(
  payload: ChatPayload,
  chatImages: MessageImage[],
  shouldUseRAG?: boolean
): Promise<BuiltChatMessage[]> {
  const { chatSettings, chatMessages, retrievedFileItems } = payload

  let CHUNK_SIZE = 12000
  if (chatSettings.model === GPT4o.modelId) {
    CHUNK_SIZE = 32000 - 4000 // -4000 for the system prompt, custom instructions, and more
  } else if (chatSettings.model === LargeModel.modelId) {
    CHUNK_SIZE = 24000 - 4000 // -4000 for the system prompt, custom instructions, and more
  } else if (chatSettings.model === SmallModel.modelId) {
    CHUNK_SIZE = 12000 - 4000 // -4000 for the system prompt, custom instructions, and more
  }

  // Adjusting the chunk size for RAG
  if (shouldUseRAG) {
    CHUNK_SIZE = 12000
  }

  let remainingTokens = CHUNK_SIZE

  const lastUserMessage = chatMessages[chatMessages.length - 2].message.content
  const lastUserMessageContent = Array.isArray(lastUserMessage)
    ? lastUserMessage
        .map(item => (item.type === "text" ? item.text : ""))
        .join(" ")
    : lastUserMessage
  const lastUserMessageTokens = countTokens(lastUserMessageContent)

  if (lastUserMessageTokens > CHUNK_SIZE) {
    const errorMessage =
      "The message you submitted was too long, please submit something shorter."
    toast.error(errorMessage)
    throw new Error(errorMessage)
  }

  const processedChatMessages = chatMessages.map((chatMessage, index) => {
    const nextChatMessage = chatMessages[index + 1]

    if (nextChatMessage === undefined) {
      return chatMessage
    }

    const returnMessage: ChatMessage = {
      ...chatMessage
    }

    if (
      chatMessage.fileItems.length > 0 &&
      chatMessage.message.role === "user"
    ) {
      // Create a structured document format for file content
      const documentsText = buildDocumentsText(chatMessage.fileItems)

      returnMessage.message = {
        ...returnMessage.message,
        content: `${documentsText}\n\n${chatMessage.message.content}`
      }
      returnMessage.fileItems = []
    }

    if (
      chatMessage.message.fragment &&
      typeof chatMessage.message.fragment === "string"
    ) {
      const fragment: Fragment = JSON.parse(chatMessage.message.fragment)

      returnMessage.message = {
        ...returnMessage.message,
        content: `Fragment: "${fragment.code}"` as string
      }
    }

    return returnMessage
  })

  const truncatedMessages: any[] = []

  for (let i = processedChatMessages.length - 1; i >= 0; i--) {
    const messageSizeLimit = Number(process.env.MESSAGE_SIZE_LIMIT || 12000)
    if (
      processedChatMessages[i].message.role === "assistant" &&
      processedChatMessages[i].message.content.length > messageSizeLimit
    ) {
      const messageSizeKeep = Number(process.env.MESSAGE_SIZE_KEEP || 2000)
      processedChatMessages[i].message = {
        ...processedChatMessages[i].message,
        content:
          processedChatMessages[i].message.content.slice(0, messageSizeKeep) +
          "\n... [output truncated]"
      }
    }
    const message = processedChatMessages[i].message

    const messageTokens = countTokens(message.content)

    if (messageTokens <= remainingTokens) {
      remainingTokens -= messageTokens
      truncatedMessages.unshift(message)
    } else {
      break
    }
  }

  const finalMessages: BuiltChatMessage[] = truncatedMessages.map(message => {
    let content

    if (message.image_paths.length > 0 && message.role !== "assistant") {
      content = [
        {
          type: "text",
          text: message.content
        },
        ...message.image_paths.map((path: string) => {
          let formedUrl = ""

          if (path.startsWith("data")) {
            formedUrl = path
          } else {
            const chatImage = chatImages.find(image => image.path === path)

            if (chatImage) {
              formedUrl = chatImage.base64
            }
          }

          return {
            type: "image_url",
            image_url: {
              url: formedUrl
            }
          }
        })
      ]
    } else {
      content = message.content
    }

    return {
      role: message.role,
      content
    }
  })

  const isPdfFile = (item: { name?: string | null }) =>
    item.name?.toLowerCase().endsWith(".pdf") ?? false

  const hasAttachedFiles =
    retrievedFileItems.length > 0 ||
    chatMessages.some(msg => msg.fileItems?.length > 0)

  if (!hasAttachedFiles) {
    return finalMessages
  }

  // Gather all PDF files from both sources
  const pdfFilesFromRetrieved = retrievedFileItems.filter(isPdfFile)
  const pdfFilesFromMessages = chatMessages.flatMap(
    msg => msg.fileItems?.filter(isPdfFile) ?? []
  )

  // Deduplicate PDF files based on file_id
  const uniquePdfFiles = Array.from(
    new Map(
      [...pdfFilesFromRetrieved, ...pdfFilesFromMessages].map(file => [
        file.file_id,
        file
      ])
    ).values()
  )

  if (
    chatSettings.model !== LargeModel.modelId ||
    uniquePdfFiles.length === 0
  ) {
    return finalMessages
  }

  // Handle PDF files
  const userMessageIndex = finalMessages.length - 2
  const userMessage = finalMessages[userMessageIndex]
  const newContent: MessageContent[] = []

  // Process unique PDF files
  for (const pdfFile of uniquePdfFiles) {
    try {
      const response = await fetch("/api/retrieval/pdf-base64", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file_id: pdfFile.file_id })
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch PDF: ${response.statusText}`)
      }

      const { base64 } = await response.json()
      newContent.push({
        type: "file",
        data: base64,
        mimeType: "application/pdf"
      })
    } catch (error) {
      console.error("Error fetching PDF base64:", error)
      newContent.push({
        type: "text",
        text: `[Error loading PDF: ${pdfFile.name}]`
      })
    }
  }

  // Add original message content
  const originalText =
    typeof userMessage.content === "string"
      ? userMessage.content
      : Array.isArray(userMessage.content)
        ? userMessage.content
            .filter(c => typeof c === "object" && c.type === "text")
            .map(c => (c as { text: string }).text)
            .join("\n")
        : ""

  newContent.push({ type: "text", text: originalText })

  // Update the user message
  finalMessages[userMessageIndex] = {
    ...userMessage,
    content: newContent
  }

  return finalMessages
}

function buildDocumentsText(fileItems: Tables<"file_items">[]) {
  const fileGroups: Record<
    string,
    { id: string; name: string; content: string[] }
  > = fileItems.reduce(
    (
      acc: Record<string, { id: string; name: string; content: string[] }>,
      item: Tables<"file_items">
    ) => {
      if (!acc[item.file_id]) {
        acc[item.file_id] = {
          id: item.file_id,
          name: item.name || "unnamed file",
          content: []
        }
      }
      acc[item.file_id].content.push(item.content)
      return acc
    },
    {}
  )

  const documents = Object.values(fileGroups)
    .map((file: any) => {
      return `<document id="${file.id}">
<source>${file.name}</source>
<document_content>${file.content.join("\n\n")}</document_content>
</document>`
    })
    .join("\n\n")

  return `<documents>\n${documents}\n</documents>`
}
