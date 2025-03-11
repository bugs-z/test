////////////////////////////////////
// Prompt Templates
////////////////////////////////////

import { ChatMessage } from "@/types/chat-message"
import endent from "endent"

export const DEFAULT_TITLE_GENERATION_PROMPT_TEMPLATE = (
  messages: ChatMessage[]
) => `### Task:
You are a helpful assistant that generates concise chat titles. Use the chatName tool to generate a title.

### Instructions:
1. Use the chatName tool to generate a concise title (3-5 words)
2. The title should clearly represent the main theme of the conversation
3. Use the chat's primary language (default to English if multilingual)

### Important:
- You MUST use the chatName tool to generate the title
- Do not generate the title directly in your response
- Do not add any additional text or explanations

### Chat History:
<chat_history>
${messages.map(message => `${message.message.role}: ${message.message.content}`).join("\n")}
</chat_history>`

export const RAG_SYSTEM_PROMPT = `Given the following conversation, relevant context, and \
a follow-up question, reply with an answer to the current question the user is asking. \
In your response, focus on providing comprehensive and accurate information, adhering \
to the user's instructions. Avoid including direct links if there's a possibility of \
broken links or references to local files. Instead, describe the resources or methods \
in detail, enabling the user to locate them through their own searches if necessary.`

const options: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "long",
  day: "numeric"
}
const currentDate = `Current date: ${new Date().toLocaleDateString("en-US", options)}`

export const RAG_SYSTEM_PROMPT_BODY = (data: { content: string }) => endent`
${process.env.SECRET_PENTESTGPT_SYSTEM_PROMPT} ${RAG_SYSTEM_PROMPT}
${currentDate}

Context for RAG enrichment:
---------------------
${data.content}
---------------------
DON'T MENTION OR REFERENCE ANYTHING RELATED TO RAG CONTENT OR ANYTHING RELATED TO RAG. \
USER DOESN'T HAVE DIRECT ACCESS TO THIS CONTENT, ITS PURPOSE IS TO ENRICH YOUR OWN KNOWLEDGE. \
ROLE PLAY.
`
