import {
  CoreAssistantMessage,
  CoreMessage,
  CoreSystemMessage,
  CoreUserMessage
} from "ai"
import { BuiltChatMessage } from "@/types/chat-message"

/**
 * Filters out empty assistant messages from the message array
 * @param messages - Array of messages to filter
 */
export function filterEmptyAssistantMessages(messages: any[]) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant" && messages[i].content.trim() === "") {
      messages.splice(i, 1)
      break
    }
  }
}

/**
 * Converts chat messages to Vercel AI SDK format
 * @param messages - Array of chat messages to convert
 * @param supportsImages - Whether the model supports image input
 * @param systemPrompt - Optional system prompt to prepend
 */
export const toVercelChatMessages = (
  messages: BuiltChatMessage[],
  supportsImages: boolean = false,
  systemPrompt?: string
): CoreMessage[] => {
  const result: CoreMessage[] = []

  // Add system message if provided
  if (systemPrompt) {
    result.push({
      role: "system",
      content: systemPrompt,
      providerOptions: {
        anthropic: { cacheControl: { type: "ephemeral" } }
      }
    } as CoreSystemMessage)
  }

  // Add the rest of the messages
  messages.forEach(message => {
    let formattedMessage: CoreMessage | null = null

    switch (message.role) {
      case "assistant":
        formattedMessage = {
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
        break
      case "user":
        formattedMessage = {
          role: "user",
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
                    content.type === "file"
                  ) {
                    return content
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
        break
      case "system":
        // Skip system messages from the array if we already added a systemPrompt
        if (!systemPrompt) {
          formattedMessage = {
            role: "system",
            content: message.content
          } as CoreSystemMessage
        }
        break
      default:
        formattedMessage = null
    }

    if (formattedMessage !== null) {
      result.push(formattedMessage)
    }
  })

  return result
}

/**
 * Handles empty or missing assistant messages by adding "Sure, " as content
 * @param messages - Array of messages to process
 * @param onlyLast - Whether to only process the last assistant message
 */
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
 * Checks if any messages in the conversation include images
 * @param messages - Array of messages to check
 * @returns boolean indicating if any messages contain images
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
 * Filters out empty assistant messages and their preceding user messages
 * @param messages - Array of messages to validate
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
 * @param messages - Array of messages to process
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
