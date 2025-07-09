import { PentestGPTContext } from '@/context/context';
import { cn } from '@/lib/utils';
import { PluginID } from '@/types/plugins';
import { Plus, SquareTerminal, Telescope, Globe, X, Image } from 'lucide-react';
import { useContext, useState } from 'react';
import { WithTooltip } from '../../ui/with-tooltip';
import { useUIContext } from '@/context/ui-context';
import { UpgradePrompt, UpgradeModal } from './upgrade-modal';
import { PLUGINS_WITHOUT_IMAGE_SUPPORT } from '@/types/plugins';
import { ToolsDropdown } from './tools-dropdown';
import { LucideIcon } from 'lucide-react';

interface ToolOptionsProps {
  fileInputRef: React.RefObject<HTMLInputElement>;
}

export const ToolOptions = ({ fileInputRef }: ToolOptionsProps) => {
  const TOOLTIP_DELAY = 500;
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState<
    | 'deep research'
    | 'terminal'
    | 'file upload'
    | 'websearch'
    | 'image generation'
  >('deep research');

  const { isPremiumSubscription, isTemporaryChat } =
    useContext(PentestGPTContext);

  const { selectedPlugin, setSelectedPlugin, isMobile } = useUIContext();

  const handleFileClick = () => {
    // Show upgrade prompt for non-premium users
    if (!isPremiumSubscription) {
      setUpgradeFeature('file upload');
      setShowUpgradePrompt(true);
      return;
    }

    // Deselect all plugins when uploading files
    if (
      selectedPlugin &&
      PLUGINS_WITHOUT_IMAGE_SUPPORT.includes(selectedPlugin)
    ) {
      setSelectedPlugin(PluginID.NONE);
    }
    fileInputRef.current?.click();
  };

  const handleUpgradePrompt = (
    feature: 'deep research' | 'terminal' | 'websearch' | 'image generation',
  ) => {
    setUpgradeFeature(feature);
    setShowUpgradePrompt(true);
  };

  const handleClosePlugin = () => {
    setSelectedPlugin(PluginID.NONE);
  };

  const isAnyToolSelected =
    selectedPlugin === PluginID.DEEP_RESEARCH ||
    selectedPlugin === PluginID.WEB_SEARCH ||
    selectedPlugin === PluginID.TERMINAL ||
    selectedPlugin === PluginID.IMAGE_GEN;

  const SelectedPluginDisplay = ({
    icon: Icon,
    label,
  }: {
    icon: LucideIcon;
    label: string;
  }) => (
    <div
      className={cn(
        'flex items-center space-x-1 cursor-pointer hover:opacity-80 rounded-lg transition-colors duration-300 px-2 py-1',
        isMobile && 'border',
      )}
      style={
        isMobile
          ? { borderColor: 'var(--interactive-label-accent-selected)' }
          : {}
      }
      onClick={handleClosePlugin}
    >
      <Icon
        size={20}
        style={{ color: 'var(--interactive-label-accent-selected)' }}
      />
      <span
        className={cn('text-sm', isMobile ? 'hidden' : 'block')}
        style={{ color: 'var(--interactive-label-accent-selected)' }}
      >
        {label}
      </span>
      <X
        size={16}
        className="ml-1"
        style={{ color: 'var(--interactive-label-accent-selected)' }}
      />
    </div>
  );

  const getSelectedPluginIcon = () => {
    switch (selectedPlugin) {
      case PluginID.DEEP_RESEARCH:
        return <SelectedPluginDisplay icon={Telescope} label="Research" />;
      case PluginID.WEB_SEARCH:
        return <SelectedPluginDisplay icon={Globe} label="Search" />;
      case PluginID.TERMINAL:
        return <SelectedPluginDisplay icon={SquareTerminal} label="Terminal" />;
      case PluginID.IMAGE_GEN:
        return <SelectedPluginDisplay icon={Image} label="Image" />;
      default:
        return null;
    }
  };

  return (
    <div className="flex items-center space-x-1">
      {/* File Upload Button */}
      {!isTemporaryChat && (
        <WithTooltip
          delayDuration={TOOLTIP_DELAY}
          side="top"
          display={
            <div className="flex flex-col">
              {!isPremiumSubscription ? (
                <UpgradePrompt feature="file upload" />
              ) : (
                <p className="font-medium">Add photos and files</p>
              )}
            </div>
          }
          trigger={
            <div className="flex items-center" onClick={handleFileClick}>
              <Plus
                className={cn(
                  'cursor-pointer rounded-lg p-1 hover:bg-black/10 focus-visible:outline-black dark:hover:bg-white/10 dark:focus-visible:outline-white',
                  !isPremiumSubscription && 'opacity-50',
                )}
                size={32}
              />
            </div>
          }
        />
      )}

      {/* Tools Dropdown */}
      <ToolsDropdown onUpgradePrompt={handleUpgradePrompt} />

      {/* Selected Plugin Display */}
      {isAnyToolSelected && (
        <div className="flex items-center">
          <div className="mx-2 text-sm text-muted-foreground">|</div>
          {getSelectedPluginIcon()}
        </div>
      )}

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={showUpgradePrompt}
        onClose={() => setShowUpgradePrompt(false)}
        feature={upgradeFeature}
      />
    </div>
  );
};
