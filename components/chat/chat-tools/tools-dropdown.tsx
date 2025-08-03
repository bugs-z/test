import { PentestGPTContext } from '@/context/context';
import { cn } from '@/lib/utils';
import { PluginID } from '@/types/plugins';
import {
  SquareTerminal,
  Telescope,
  Settings2,
  Globe,
  Check,
  Image,
} from 'lucide-react';
import { useContext } from 'react';
import { useUIContext } from '@/context/ui-context';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ToolsDropdownProps {
  onUpgradePrompt: (
    feature: 'deep research' | 'terminal' | 'websearch' | 'image generation',
  ) => void;
}

export const ToolsDropdown = ({ onUpgradePrompt }: ToolsDropdownProps) => {
  const { isPremiumSubscription, isTemporaryChat } =
    useContext(PentestGPTContext);

  const { selectedPlugin, setSelectedPlugin, isMobile } = useUIContext();

  const handlePentestAgentToggle = () => {
    setSelectedPlugin(
      selectedPlugin === PluginID.TERMINAL ? PluginID.NONE : PluginID.TERMINAL,
    );
  };

  const handleResearchToggle = () => {
    if (!isPremiumSubscription) {
      onUpgradePrompt('deep research');
      return;
    }

    setSelectedPlugin(
      selectedPlugin === PluginID.DEEP_RESEARCH
        ? PluginID.NONE
        : PluginID.DEEP_RESEARCH,
    );
  };

  const handleWebSearchToggle = () => {
    setSelectedPlugin(
      selectedPlugin === PluginID.WEB_SEARCH
        ? PluginID.NONE
        : PluginID.WEB_SEARCH,
    );
  };

  const handleImageGenToggle = () => {
    if (!isPremiumSubscription) {
      onUpgradePrompt('image generation');
      return;
    }

    setSelectedPlugin(
      selectedPlugin === PluginID.IMAGE_GEN
        ? PluginID.NONE
        : PluginID.IMAGE_GEN,
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <div
          className={cn(
            'flex items-center rounded-lg transition-colors duration-300 cursor-pointer',
            'hover:bg-black/10 dark:hover:bg-white/10',
          )}
        >
          {/* Settings Icon */}
          <Settings2
            className={cn(
              'text-primary p-1 focus-visible:outline-black dark:focus-visible:outline-white',
            )}
            size={32}
          />

          {/* Tools text */}
          <div
            className={cn(
              'whitespace-nowrap text-sm transition-all duration-300',
              'max-w-[100px] pr-2 ml-1',
              isMobile ? 'hidden' : 'opacity-100',
            )}
          >
            Tools
          </div>
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={5}
        className="w-56 bg-secondary"
      >
        <div className="px-3 py-2 text-sm font-medium text-muted-foreground">
          Tools
        </div>
        {!isTemporaryChat && (
          <DropdownMenuItem
            onClick={handleImageGenToggle}
            className={cn(
              'flex items-center justify-between cursor-pointer py-3',
              !isPremiumSubscription && 'opacity-50',
            )}
          >
            <div className="flex items-center space-x-3">
              <Image
                size={20}
                style={
                  selectedPlugin === PluginID.IMAGE_GEN
                    ? { color: 'var(--interactive-label-accent-selected)' }
                    : {}
                }
              />
              <span
                style={
                  selectedPlugin === PluginID.IMAGE_GEN
                    ? { color: 'var(--interactive-label-accent-selected)' }
                    : {}
                }
              >
                Create an image
              </span>
            </div>
            {selectedPlugin === PluginID.IMAGE_GEN && (
              <Check
                size={20}
                style={{ color: 'var(--interactive-label-accent-selected)' }}
              />
            )}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={handleWebSearchToggle}
          className="flex items-center justify-between cursor-pointer py-3"
        >
          <div className="flex items-center space-x-3">
            <Globe
              size={20}
              style={
                selectedPlugin === PluginID.WEB_SEARCH
                  ? { color: 'var(--interactive-label-accent-selected)' }
                  : {}
              }
            />
            <span
              style={
                selectedPlugin === PluginID.WEB_SEARCH
                  ? { color: 'var(--interactive-label-accent-selected)' }
                  : {}
              }
            >
              Search the web
            </span>
          </div>
          {selectedPlugin === PluginID.WEB_SEARCH && (
            <Check
              size={20}
              style={{ color: 'var(--interactive-label-accent-selected)' }}
            />
          )}
        </DropdownMenuItem>
        {!isTemporaryChat && (
          <DropdownMenuItem
            onClick={handlePentestAgentToggle}
            className="flex items-center justify-between cursor-pointer py-3"
          >
            <div className="flex items-center space-x-3">
              <SquareTerminal
                size={20}
                style={
                  selectedPlugin === PluginID.TERMINAL
                    ? { color: 'var(--interactive-label-accent-selected)' }
                    : {}
                }
              />
              <span
                style={
                  selectedPlugin === PluginID.TERMINAL
                    ? { color: 'var(--interactive-label-accent-selected)' }
                    : {}
                }
              >
                Use terminal
              </span>
            </div>
            {selectedPlugin === PluginID.TERMINAL && (
              <Check
                size={20}
                style={{ color: 'var(--interactive-label-accent-selected)' }}
              />
            )}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          onClick={handleResearchToggle}
          className={cn(
            'flex items-center justify-between cursor-pointer py-3',
            !isPremiumSubscription && 'opacity-50',
          )}
        >
          <div className="flex items-center space-x-3">
            <Telescope
              size={20}
              style={
                selectedPlugin === PluginID.DEEP_RESEARCH
                  ? { color: 'var(--interactive-label-accent-selected)' }
                  : {}
              }
            />
            <span
              style={
                selectedPlugin === PluginID.DEEP_RESEARCH
                  ? { color: 'var(--interactive-label-accent-selected)' }
                  : {}
              }
            >
              Run deep research
            </span>
          </div>
          {selectedPlugin === PluginID.DEEP_RESEARCH && (
            <Check
              size={20}
              style={{ color: 'var(--interactive-label-accent-selected)' }}
            />
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
