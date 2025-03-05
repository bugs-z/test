import { FileItemChunk } from "@/types"
import { encode } from "gpt-tokenizer"
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf"
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter"
import { CHUNK_OVERLAP, CHUNK_SIZE } from "."

export const processPdf = async (pdf: Blob): Promise<FileItemChunk[]> => {
  const loader = new PDFLoader(pdf)
  const docs = await loader.load()
  const completeText = docs.map(doc => doc.pageContent).join(" ")

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP
  })
  const splitDocs = await splitter.createDocuments([completeText])

  if (splitDocs.length > 8) {
    const totalTokens = splitDocs.reduce(
      (acc, doc) => acc + encode(doc.pageContent).length,
      0
    )

    if (totalTokens > 16000) {
      throw new Error("PDF file is too large.")
    }

    return [
      {
        content: "",
        tokens: 0,
        isEmptyPdfChunk: true
      }
    ]
  }

  const chunks: FileItemChunk[] = []

  for (let i = 0; i < splitDocs.length; i++) {
    const doc = splitDocs[i]

    chunks.push({
      content: doc.pageContent,
      tokens: encode(doc.pageContent).length,
      isEmptyPdfChunk: false
    })
  }

  return chunks
}
