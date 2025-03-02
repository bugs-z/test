import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  IconLoader2,
  IconX,
  IconMessagePlus,
  IconMessages
} from "@tabler/icons-react"
import { FC, useContext, useEffect, useState } from "react"
import { PentestGPTContext } from "@/context/context"
import { useChatHandler } from "../chat/chat-hooks/use-chat-handler"
import { cn } from "@/lib/utils"
import { Button } from "../ui/button"
import { DateCategory, sortByDateCategory } from "@/lib/utils"

interface SearchChatsDialogProps {
  isOpen: boolean
  onClose: () => void
}

interface SearchResult {
  chat_id: string
  title: string
  created_at: string
  updated_at: string
  preview_message?: string
}

interface HighlightedTextProps {
  text: string
  searchTerms: string[]
}

const HighlightedText = ({ text, searchTerms }: HighlightedTextProps) => {
  if (!searchTerms.length) return text

  const regex = new RegExp(
    `(${searchTerms
      .filter(Boolean)
      .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|")})`,
    "gi"
  )

  return (
    <>
      {text.split(regex).map((part, i) =>
        regex.test(part) ? (
          <span key={i} className="font-bold">
            {part}
          </span>
        ) : (
          part
        )
      )}
    </>
  )
}

const formatDate = (date: string) => {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric"
  })
}

export const SearchChatsDialog: FC<SearchChatsDialogProps> = ({
  isOpen,
  onClose
}) => {
  const [searchTerm, setSearchTerm] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const { chats } = useContext(PentestGPTContext)
  const { handleSelectChat, handleNewChat } = useChatHandler()

  useEffect(() => {
    const searchChats = async () => {
      if (!searchTerm) {
        setSearchResults([])
        return
      }

      setIsLoading(true)
      try {
        const response = await fetch(
          `/backend-api/chats/search?query=${searchTerm}`
        )
        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.error || "Search failed")
        }

        setSearchResults(data.results)
      } catch (error) {
        console.error("Search error:", error)
        setSearchResults([])
      } finally {
        setIsLoading(false)
      }
    }

    const debounce = setTimeout(searchChats, 300)
    return () => clearTimeout(debounce)
  }, [searchTerm])

  // Reset search when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSearchTerm("")
      setSearchResults([])
    }
  }, [isOpen])

  const getSortedChats = (category: DateCategory) => {
    const chatsToSort = searchTerm
      ? searchResults
      : chats.map(chat => ({
          chat_id: chat.id,
          title: chat.name,
          created_at: chat.created_at,
          updated_at: chat.updated_at,
          preview_message: ""
        }))

    return sortByDateCategory(chatsToSort as SearchResult[], category)
  }

  const handleChatClick = async (result: SearchResult) => {
    await handleSelectChat({ chat_id: result.chat_id })
    onClose()
  }

  const handleCreateNewChat = async () => {
    await handleNewChat()
    onClose()
  }

  const dateCategories: DateCategory[] = [
    "Today",
    "Yesterday",
    "Previous 7 Days",
    "Previous 30 Days",
    "Older"
  ]

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogTitle className="sr-only">Search Chats</DialogTitle>
      <DialogContent className="max-w-xl gap-0 p-0 outline-none">
        <div className="flex items-center border-b p-3">
          <div className="relative flex-1">
            <Input
              placeholder="Search chats..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="text-md border-0 pr-8 outline-none focus-visible:ring-0"
            />
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-1/2 size-8 -translate-y-1/2 hover:bg-transparent"
              onClick={onClose}
            >
              <IconX className="text-muted-foreground" size={18} />
            </Button>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <IconLoader2 className="size-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-3 py-2">
              {!searchTerm && (
                <div
                  onClick={handleCreateNewChat}
                  className={cn(
                    "hover:bg-accent flex cursor-pointer items-center rounded-lg px-4 py-3",
                    "transition-colors duration-200"
                  )}
                >
                  <IconMessagePlus
                    size={24}
                    className="text-muted-foreground mr-3.5 shrink-0"
                  />
                  <div className="text-sm font-medium">New chat</div>
                </div>
              )}

              {searchResults.length === 0 && searchTerm ? (
                <div className="text-muted-foreground py-4 text-center">
                  No chats found
                </div>
              ) : (
                (!searchTerm || searchResults.length > 0) &&
                dateCategories.map(category => {
                  const chats = getSortedChats(category)
                  if (chats.length === 0) return null

                  return (
                    <div key={category} className="pb-2">
                      <div className="text-muted-foreground bg-background sticky top-0 z-10 mb-1 py-1 pl-2 text-xs font-bold">
                        {category}
                      </div>
                      <div className="divide-y">
                        {chats.map(result => (
                          <div
                            key={result.chat_id}
                            onClick={() =>
                              handleChatClick(result as SearchResult)
                            }
                            className={cn(
                              "hover:bg-accent group flex cursor-pointer flex-col rounded-lg px-4 py-3",
                              "transition-colors duration-200"
                            )}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center">
                                <IconMessages
                                  size={24}
                                  className="text-muted-foreground mr-3.5 shrink-0"
                                />
                                <div className="flex flex-col">
                                  <div className="text-sm font-medium">
                                    <HighlightedText
                                      text={result.title}
                                      searchTerms={
                                        searchTerm ? searchTerm.split(" ") : []
                                      }
                                    />
                                  </div>
                                  {result.preview_message && (
                                    <div className="text-muted-foreground mt-1 line-clamp-2 text-xs">
                                      <HighlightedText
                                        text={result.preview_message}
                                        searchTerms={
                                          searchTerm
                                            ? searchTerm.split(" ")
                                            : []
                                        }
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                              {searchTerm && (
                                <div className="text-muted-foreground ml-4 text-xs opacity-0 transition-opacity group-hover:opacity-100">
                                  {formatDate(
                                    result.updated_at || result.created_at
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
