import { IconLayoutSidebar, IconSearch } from '@tabler/icons-react';
import type { FC } from 'react';
import type { ContentType } from '@/types';
import { SidebarCreateButtons } from './sidebar-create-buttons';
import { SIDEBAR_ICON_SIZE } from './sidebar-content';
import { Button } from '../ui/button';
import { WithTooltip } from '../ui/with-tooltip';
import { ChatSearchPopup } from '../chat/chat-search-popup';
import { useUIContext } from '@/context/ui-context';

interface SidebarHeaderProps {
  handleToggleSidebar: () => void;
  contentType: ContentType;
  handleSidebarVisibility: () => void;
}

export const SidebarHeader: FC<SidebarHeaderProps> = ({
  handleToggleSidebar,
  contentType,
  handleSidebarVisibility,
}) => {
  const { isSearchOpen, setIsSearchOpen } = useUIContext();

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex w-full items-center justify-between">
        <WithTooltip
          display={'Close sidebar'}
          trigger={
            <Button
              variant="ghost"
              className="size-10 p-0"
              onClick={handleToggleSidebar}
            >
              <IconLayoutSidebar size={SIDEBAR_ICON_SIZE} />
            </Button>
          }
          side="right"
        />

        <div className="flex items-center gap-2">
          <SidebarCreateButtons
            contentType={contentType}
            handleSidebarVisibility={handleSidebarVisibility}
          />
        </div>
      </div>

      <div className="w-full">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-primary px-2"
          onClick={() => setIsSearchOpen(true)}
        >
          <IconSearch size={20} />
          Search chats
        </Button>
      </div>

      <ChatSearchPopup
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </div>
  );
};
