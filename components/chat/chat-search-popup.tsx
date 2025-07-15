'use client';

import { useState, useEffect, useContext } from 'react';
import { searchMessages, type SearchMessageResult } from '@/db/messages';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useRef } from 'react';
import {
  IconSearch,
  IconMessage,
  IconLoader2,
  IconX,
  IconMessagePlus,
} from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { PentestGPTContext } from '@/context/context';
import { sortByDateCategory, type DateCategory } from '@/lib/utils';
import type { Doc } from '@/convex/_generated/dataModel';
import { useChatHandler } from './chat-hooks/use-chat-handler';

interface ChatSearchPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChatSearchPopup = ({ isOpen, onClose }: ChatSearchPopupProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [allResults, setAllResults] = useState<SearchMessageResult[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const loaderRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const isFetchingRef = useRef<boolean>(false);
  const router = useRouter();
  const { chats } = useContext(PentestGPTContext);
  const { handleNewChat } = useChatHandler();

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Search effect
  useEffect(() => {
    const performSearch = async () => {
      if (!debouncedQuery.trim()) {
        setAllResults([]);
        setNextCursor(null);
        setIsSearching(false);
        return;
      }

      // Limit search to 16 terms (words)
      const words = debouncedQuery.trim().split(/\s+/);
      const limitedQuery = words.slice(0, 16).join(' ');

      setIsSearching(true);
      try {
        const results = await searchMessages(limitedQuery);
        // Ensure unique results by ID
        const uniqueResults = results.page.filter(
          (item, index, self) =>
            index === self.findIndex((t) => t.id === item.id),
        );
        setAllResults(uniqueResults);
        setNextCursor(results.isDone ? null : results.continueCursor);
      } catch (error) {
        console.error('Search error:', error);
        setAllResults([]);
        setNextCursor(null);
      } finally {
        setIsSearching(false);
      }
    };

    performSearch();
  }, [debouncedQuery]);

  // Reset state when search query changes
  useEffect(() => {
    setAllResults([]);
    setNextCursor(null);
    setIsLoadingMore(false);
    isFetchingRef.current = false;
  }, [debouncedQuery]);

  // Set up Intersection Observer for infinite scrolling
  useEffect(() => {
    const options = {
      root: null,
      rootMargin: '100px', // Start loading before reaching the end
      threshold: 0.1, // Trigger when at least 10% of the element is visible
    };

    observerRef.current = new IntersectionObserver((entries) => {
      const [entry] = entries;
      if (
        entry.isIntersecting &&
        !isLoadingMore &&
        !isFetchingRef.current &&
        nextCursor &&
        debouncedQuery.trim()
      ) {
        isFetchingRef.current = true;
        setIsLoadingMore(true);
        loadMoreResults();
      }
    }, options);

    if (loaderRef.current && debouncedQuery.trim() && nextCursor) {
      observerRef.current.observe(loaderRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [loaderRef, isLoadingMore, nextCursor, debouncedQuery]);

  // Load more results function
  const loadMoreResults = async () => {
    if (!debouncedQuery.trim() || !nextCursor || isLoadingMore) return;

    // Limit search to 16 terms (words)
    const words = debouncedQuery.trim().split(/\s+/);
    const limitedQuery = words.slice(0, 16).join(' ');

    try {
      const results = await searchMessages(limitedQuery, nextCursor);

      // Disconnect observer while processing results
      if (observerRef.current && loaderRef.current) {
        observerRef.current.unobserve(loaderRef.current);
      }

      setAllResults((prev) => {
        const existingIds = new Set(prev.map((item) => item.id));
        const newResults = results.page.filter(
          (item) => !existingIds.has(item.id),
        );
        return [...prev, ...newResults];
      });
      setNextCursor(results.isDone ? null : results.continueCursor);
      setIsLoadingMore(false);
      isFetchingRef.current = false;

      // Reconnect observer if there's more content to load
      if (
        observerRef.current &&
        loaderRef.current &&
        results.continueCursor &&
        !results.isDone
      ) {
        observerRef.current.observe(loaderRef.current);
      }
    } catch (error) {
      console.error('Error loading more results:', error);
      setIsLoadingMore(false);
      isFetchingRef.current = false;
    }
  };

  const handleChatClick = (chatId: string) => {
    router.push(`/c/${chatId}`);
    onClose();
  };

  const handleNewChatClick = () => {
    handleNewChat();
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  const highlightSearchTerm = (text: string, searchTerm: string) => {
    if (!searchTerm.trim()) return text;

    const regex = new RegExp(
      `(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
      'gi',
    );
    const parts = text.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark
          key={index}
          className="bg-yellow-200 dark:bg-yellow-800 px-1 rounded"
        >
          {part}
        </mark>
      ) : (
        part
      ),
    );
  };

  const formatChatDate = (date: Date) => {
    return format(date, 'MMM d');
  };

  const getSortedChats = (chats: Doc<'chats'>[], category: DateCategory) => {
    return sortByDateCategory(chats, category);
  };

  const renderChatItem = (chat: Doc<'chats'>) => (
    <div
      key={chat.id}
      className="px-6 py-3 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/50 last:border-b-0"
      onClick={() => handleChatClick(chat.id)}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <IconMessage size={20} className="text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{chat.name}</span>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {formatChatDate(new Date(chat.updated_at || chat._creationTime))}
        </span>
      </div>
    </div>
  );

  const renderRecentChats = () => {
    const dateCategories: DateCategory[] = [
      'Today',
      'Yesterday',
      'Previous 7 Days',
      'Previous 30 Days',
      'Older',
    ];

    return (
      <div className="py-2">
        {/* New chat option */}
        <div
          className="px-6 py-3 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/50"
          onClick={handleNewChatClick}
        >
          <div className="flex items-center gap-3">
            <IconMessagePlus
              size={20}
              className="text-muted-foreground shrink-0"
            />
            <span className="text-sm font-medium">New chat</span>
          </div>
        </div>

        {dateCategories.map((category) => {
          const sortedChats = getSortedChats(chats, category);

          if (sortedChats.length === 0) return null;

          return (
            <div key={category}>
              <div className="px-6 py-2 text-xs font-semibold text-muted-foreground bg-muted/30 sticky top-0 z-10">
                {category}
              </div>
              {sortedChats.map(renderChatItem)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="flex flex-col max-w-[680px] w-full h-[440px] p-0 gap-0"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader className="border-b flex-shrink-0 p-0">
          <DialogTitle className="sr-only">Search Chats</DialogTitle>
          <div className="ms-6 me-4 flex h-16 items-center justify-between">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <IconSearch
                size={20}
                className="text-muted-foreground shrink-0"
              />
              <Input
                placeholder="Search chats"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 text-base placeholder:text-muted-foreground"
                autoFocus
              />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 hover:bg-muted/50 shrink-0"
            >
              <IconX size={18} />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto">
            {!debouncedQuery.trim() ? (
              chats.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">
                  <div className="text-center">
                    <IconMessage
                      size={48}
                      className="mx-auto mb-4 opacity-50"
                    />
                    <p className="text-sm">No results</p>
                  </div>
                </div>
              ) : (
                renderRecentChats()
              )
            ) : isSearching ? (
              <div className="flex items-center justify-center py-12">
                <IconLoader2 className="animate-spin mr-2" size={20} />
                <span className="text-sm">Searching...</span>
              </div>
            ) : allResults.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <div className="text-center">
                  <IconSearch size={48} className="mx-auto mb-4 opacity-50" />
                  <p className="text-sm">No results</p>
                </div>
              </div>
            ) : (
              <div className="py-2">
                {allResults.map((message, index) => (
                  <div
                    key={`${message.id}-${index}`}
                    className="px-6 py-3 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/50 last:border-b-0"
                    onClick={() => handleChatClick(message.chat_id)}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <IconMessage
                          size={16}
                          className="text-muted-foreground shrink-0"
                        />
                        <span className="text-sm font-medium truncate">
                          {message.chat_name || 'Unnamed Chat'}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatChatDate(
                          new Date(message.updated_at || message.created_at),
                        )}
                      </span>
                    </div>

                    <div className="text-sm line-clamp-3 text-foreground/80 leading-relaxed ml-7">
                      {highlightSearchTerm(message.content, debouncedQuery)}
                    </div>
                  </div>
                ))}

                {/* Loader element for intersection observer */}
                {nextCursor && debouncedQuery.trim() && (
                  <div ref={loaderRef} className="flex justify-center py-4">
                    {isLoadingMore && (
                      <>
                        <IconLoader2 className="animate-spin mr-2" size={16} />
                        <span className="text-sm">Loading more...</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
