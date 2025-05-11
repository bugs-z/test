import { PentestGPTContext } from '@/context/context';
import { cn } from '@/lib/utils';
import { PluginID } from '@/types/plugins';
import { SquareTerminal, Paperclip } from 'lucide-react';
import { useContext, useState } from 'react';
import { WithTooltip } from '../../ui/with-tooltip';
import { useUIContext } from '@/context/ui-context';
import { UpgradePrompt } from '@/components/ui/upgrade-prompt';
import { PLUGINS_WITHOUT_IMAGE_SUPPORT } from '@/types/plugins';

interface ToolOptionsProps {
  fileInputRef: React.RefObject<HTMLInputElement>;
}

export const ToolOptions = ({ fileInputRef }: ToolOptionsProps) => {
  const TOOLTIP_DELAY = 500;
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);

  const { isPremiumSubscription, newMessageImages, isTemporaryChat } =
    useContext(PentestGPTContext);

  const { selectedPlugin, setSelectedPlugin, isMobile } = useUIContext();

  const hasImageAttached = newMessageImages.length > 0;

  const handleFileClick = () => {
    // Deselect all plugins when uploading files
    if (
      selectedPlugin &&
      PLUGINS_WITHOUT_IMAGE_SUPPORT.includes(selectedPlugin)
    ) {
      setSelectedPlugin(PluginID.NONE);
    }
    fileInputRef.current?.click();
  };

  const handleTerminalToggle = () => {
    if (hasImageAttached && !isPremiumSubscription) return;

    if (!isPremiumSubscription) {
      setShowUpgradePrompt(true);
      return;
    }

    setSelectedPlugin(
      selectedPlugin === PluginID.PENTEST_AGENT
        ? PluginID.NONE
        : PluginID.PENTEST_AGENT,
    );
  };

  return (
    <div className="flex space-x-1">
      {/* File Upload Button */}
      {isPremiumSubscription && (
        <WithTooltip
          delayDuration={TOOLTIP_DELAY}
          side="top"
          display={
            <div className="flex flex-col">
              <p className="font-medium">Upload Files</p>
            </div>
          }
          trigger={
            <div
              className="flex flex-row items-center"
              onClick={handleFileClick}
            >
              <Paperclip
                className="cursor-pointer rounded-lg rounded-bl-xl p-1 hover:bg-black/10 focus-visible:outline-black dark:hover:bg-white/10 dark:focus-visible:outline-white"
                size={32}
              />
            </div>
          }
        />
      )}

      {/* Terminal Tool - Only show if not in temporary chat */}
      {!isTemporaryChat && (
        <WithTooltip
          delayDuration={TOOLTIP_DELAY}
          side="top"
          display={
            <div className="flex flex-col">
              {!isPremiumSubscription ? (
                <UpgradePrompt
                  title="Upgrade to Pro"
                  description="Get access to pentest agent and more features with Pro"
                  buttonText="Upgrade Now"
                />
              ) : (
                <p className="font-medium">Use pentest agent</p>
              )}
            </div>
          }
          trigger={
            <div
              className={cn(
                'relative flex flex-row items-center rounded-lg transition-colors duration-300',
                selectedPlugin === PluginID.PENTEST_AGENT
                  ? 'bg-primary/10'
                  : 'hover:bg-black/10 dark:hover:bg-white/10',
                hasImageAttached &&
                  !isPremiumSubscription &&
                  'pointer-events-none opacity-50',
                !isPremiumSubscription && 'opacity-50',
              )}
              onClick={handleTerminalToggle}
            >
              <SquareTerminal
                className={cn(
                  'cursor-pointer rounded-lg rounded-bl-xl p-1 focus-visible:outline-black dark:focus-visible:outline-white',
                  selectedPlugin === PluginID.PENTEST_AGENT
                    ? 'text-primary'
                    : 'opacity-50',
                )}
                size={32}
              />
              <div
                className={cn(
                  'whitespace-nowrap text-xs font-medium',
                  'transition-all duration-300',
                  !isMobile && 'max-w-[100px] pr-2',
                  isMobile &&
                    (selectedPlugin === PluginID.PENTEST_AGENT
                      ? 'max-w-[100px] pr-2 opacity-100'
                      : 'max-w-0 opacity-0'),
                )}
              >
                {isMobile ? 'Agent' : 'Pentest Agent'}
              </div>
            </div>
          }
        />
      )}

      {/* Upgrade Prompt Modal */}
      {showUpgradePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg p-6">
            <UpgradePrompt
              title="Upgrade to Pro"
              description="Get access to terminal and more features with Pro"
              buttonText="Upgrade Now"
            />
            <button
              className="mt-4 w-full rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
              onClick={() => setShowUpgradePrompt(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
