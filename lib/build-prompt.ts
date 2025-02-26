import {
  BuiltChatMessage,
  ChatMessage,
  ChatPayload,
  MessageImage
} from "@/types"
import {
  CoreAssistantMessage,
  CoreMessage,
  CoreSystemMessage,
  CoreUserMessage
} from "ai"
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
    CHUNK_SIZE = 32000 - 4000 // -4000 for the system prompt, custom instructions, and more
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

  if (retrievedFileItems.length > 0) {
    const documentsText = buildDocumentsText(retrievedFileItems)

    finalMessages[finalMessages.length - 2] = {
      ...finalMessages[finalMessages.length - 2],
      content: `${documentsText}\n\n${finalMessages[finalMessages.length - 2].content}`
    }
  }

  return finalMessages
}

export function filterEmptyAssistantMessages(messages: any[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant" && messages[i].content.trim() === "") {
      messages.splice(i, 1)
      break
    }
  }
}

export const toVercelChatMessages = (
  messages: BuiltChatMessage[],
  supportsImages: boolean = false
): CoreMessage[] => {
  return messages
    .map(message => {
      switch (message.role) {
        case "assistant":
          return {
            role: "assistant",
            content: Array.isArray(message.content)
              ? message.content.map(content => {
                  if (typeof content === "object" && content.type === "text") {
                    return {
                      type: "text",
                      text: content.text
                    }
                  } else {
                    return {
                      type: "text",
                      text: content
                    }
                  }
                })
              : [{ type: "text", text: message.content as string }]
          } as CoreAssistantMessage
        case "user":
          return {
            role: message.role,
            content: Array.isArray(message.content)
              ? message.content
                  .map(content => {
                    if (
                      typeof content === "object" &&
                      content.type === "image_url"
                    ) {
                      if (supportsImages) {
                        return {
                          type: "image",
                          image: new URL(content.image_url.url)
                        }
                      } else {
                        return null
                      }
                    } else if (
                      typeof content === "object" &&
                      content.type === "text"
                    ) {
                      return {
                        type: "text",
                        text: content.text
                      }
                    } else {
                      return {
                        type: "text",
                        text: content
                      }
                    }
                  })
                  .filter(Boolean)
              : [{ type: "text", text: message.content as string }]
          } as CoreUserMessage
        case "system":
          return {
            role: "system",
            content: message.content
          } as CoreSystemMessage
        default:
          return null
      }
    })
    .filter(message => message !== null)
}

export function handleAssistantMessages(
  messages: any[],
  onlyLast: boolean = false
) {
  let foundAssistant = false
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      foundAssistant = true
      if (messages[i].content.trim() === "") {
        messages[i].content = "Sure, "
      }
      if (onlyLast) break
    }
  }

  if (!foundAssistant) {
    messages.push({ role: "assistant", content: "Sure, " })
  }
}

/**
 * Checks if any messages in the conversation include images.
 * This function is used to determine if image processing capabilities are needed
 * for the current context of the conversation.
 *
 * @param messages - The array of all messages in the conversation
 * @returns boolean - True if any messages contain an image, false otherwise
 */
export function messagesIncludeImages(messages: BuiltChatMessage[]): boolean {
  const recentMessages = messages.slice(-6)

  return recentMessages.some(
    message =>
      Array.isArray(message.content) &&
      message.content.some(
        item =>
          typeof item === "object" &&
          "type" in item &&
          item.type === "image_url"
      )
  )
}

/**
 * Filters out empty assistant messages and their preceding user messages.
 * Specifically handles Mistral API's edge case of empty responses.
 * Used in both chat and question generation flows.
 *
 * @param messages - Array of chat messages
 * @returns Filtered array with valid messages only
 */
export function validateMessages(messages: any[]) {
  const validMessages = []

  for (let i = 0; i < messages.length; i++) {
    const currentMessage = messages[i]
    const nextMessage = messages[i + 1]

    // Skip empty assistant responses (Mistral-specific)
    const isInvalidExchange =
      currentMessage.role === "user" &&
      nextMessage?.role === "assistant" &&
      !nextMessage.content

    if (isInvalidExchange) {
      i++ // Skip next message
      continue
    }

    // Keep valid messages
    if (currentMessage.role !== "assistant" || currentMessage.content) {
      validMessages.push(currentMessage)
    }
  }

  return validMessages
}

/**
 * Removes the last assistant message if it only contains "Sure, "
 * @param messages - Array of chat messages
 * @returns Filtered array without the "Sure, " message
 */
export function removeLastSureMessage(messages: any[]) {
  if (messages.length === 0) return messages

  const lastMessage = messages[messages.length - 1]
  if (
    lastMessage.role === "assistant" &&
    lastMessage.content.trim().toLowerCase() === "sure,"
  ) {
    return messages.slice(0, -1)
  }

  return messages
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
