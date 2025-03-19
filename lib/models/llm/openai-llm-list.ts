import { LLM } from "@/types"

export const Agent: LLM = {
  modelId: "gpt-4-turbo-preview", // Not a good idea to change as it could be stored in browser and it's in the DB, carefully change this if required.
  modelName: "PentestGPT Agent",
  shortModelName: "PGPT-Agent",
  provider: "openai",
  imageInput: true
}

export const OPENAI_LLM_LIST: LLM[] = [Agent]
