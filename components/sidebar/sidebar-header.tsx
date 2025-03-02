import { IconLayoutSidebarRightExpand, IconSearch } from "@tabler/icons-react"
import { FC, useState } from "react"
import { ContentType } from "@/types"
import { SidebarCreateButtons } from "./sidebar-create-buttons"
import { SIDEBAR_ICON_SIZE } from "./sidebar-content"
import { Button } from "../ui/button"
import { WithTooltip } from "../ui/with-tooltip"
import { SearchChatsDialog } from "../utility/search-chats-dialog"

interface SidebarHeaderProps {
  handleToggleSidebar: () => void
  contentType: ContentType
  handleSidebarVisibility: () => void
}

export const SidebarHeader: FC<SidebarHeaderProps> = ({
  handleToggleSidebar,
  contentType,
  handleSidebarVisibility
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false)

  return (
    <>
      <div className="flex w-full items-center justify-between">
        <WithTooltip
          display={"Close sidebar"}
          trigger={
            <Button
              variant="ghost"
              className="size-10 p-0"
              onClick={handleToggleSidebar}
            >
              <IconLayoutSidebarRightExpand size={SIDEBAR_ICON_SIZE} />
            </Button>
          }
          side="right"
        />

        <div className="flex items-center gap-2">
          <WithTooltip
            display={"Search chats"}
            trigger={
              <Button
                variant="ghost"
                className="size-10 p-0"
                onClick={() => setIsSearchOpen(true)}
              >
                <IconSearch size={SIDEBAR_ICON_SIZE} />
              </Button>
            }
            side="bottom"
          />

          <SidebarCreateButtons
            contentType={contentType}
            handleSidebarVisibility={handleSidebarVisibility}
          />
        </div>
      </div>

      <SearchChatsDialog
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </>
  )
}
