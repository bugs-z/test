import React, { type FC, useMemo, useState, useEffect, useRef } from 'react';
import { ChevronDown, Repeat } from 'lucide-react';
import { WithTooltip } from './with-tooltip';
import { SmallModel, LargeModel, ReasoningModel } from '@/lib/models/llm-list';
import { PluginID } from '@/types/plugins';
import { Menu, MenuItems, MenuButton, MenuItem } from '@headlessui/react';

interface SwitchModelProps {
  currentModel: string;
  onChangeModel: (model: string) => void;
  isMobile: boolean;
  messagePlugin?: string | null;
}

interface ModelConfig {
  id: string;
  name: string;
  description: string;
}

const MODELS: ModelConfig[] = [
  {
    id: LargeModel.modelId,
    name: LargeModel.modelName,
    description: LargeModel.description || 'Great for most questions',
  },
  {
    id: SmallModel.modelId,
    name: SmallModel.modelName,
    description: SmallModel.description || 'Faster for most questions',
  },
  {
    id: ReasoningModel.modelId,
    name: ReasoningModel.modelName,
    description: ReasoningModel.description || 'Uses advanced reasoning',
  },
];

const getModelDisplayName = (
  modelId: string,
  plugin?: string | null,
): string => {
  if (plugin === PluginID.DEEP_RESEARCH) return 'research';

  switch (modelId) {
    case SmallModel.modelId:
      return SmallModel.shortModelName?.toLowerCase() || 'small';
    case LargeModel.modelId:
      return LargeModel.shortModelName?.toLowerCase() || 'large';
    case ReasoningModel.modelId:
      return ReasoningModel.shortModelName?.toLowerCase() || 'reason';
    default:
      return modelId.toLowerCase();
  }
};

const ModelItem: FC<{
  model: ModelConfig;
  isActive: boolean;
  onClick: () => void;
}> = ({ model, isActive, onClick }) => (
  <MenuItem>
    {({ focus }) => (
      <button
        onClick={onClick}
        className={`
          group flex w-full rounded-sm px-3 py-2.5 text-left transition-colors
          ${focus ? 'bg-accent text-accent-foreground' : 'text-secondary-foreground'}
          ${isActive ? 'items-center justify-between' : 'flex-col items-start'}
        `}
      >
        <div className="flex flex-col items-start text-left min-w-0 flex-1">
          <div className="text-sm font-medium truncate w-full">
            {model.name}
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
            {model.description}
          </div>
        </div>
        {isActive && (
          <Repeat
            size={18}
            className="ml-2 flex-shrink-0 text-muted-foreground"
          />
        )}
      </button>
    )}
  </MenuItem>
);

export const SwitchModel: FC<SwitchModelProps> = ({
  currentModel,
  onChangeModel,
  isMobile,
  messagePlugin,
}) => {
  const [shouldOpenUpward, setShouldOpenUpward] = useState(false);
  const [shouldCenter, setShouldCenter] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const calculatePosition = () => {
      if (!buttonRef.current) return;

      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      setShouldOpenUpward(spaceBelow < 300 && spaceAbove > spaceBelow);
      setShouldCenter(isMobile);
    };

    calculatePosition();
    window.addEventListener('resize', calculatePosition);
    return () => window.removeEventListener('resize', calculatePosition);
  }, [isMobile]);

  const displayName = useMemo(
    () => getModelDisplayName(currentModel, messagePlugin),
    [currentModel, messagePlugin],
  );

  const iconSize = isMobile ? 22 : 20;
  const availableModels = MODELS.filter((model) => model.id !== currentModel);
  const currentModelData = MODELS.find((model) => model.id === currentModel);

  // Responsive width and positioning
  const dropdownWidth = isMobile ? 'w-[240px]' : 'w-[280px]';
  const maxWidth = isMobile ? 'max-w-[calc(100vw-32px)]' : 'max-w-[280px]';

  const getPositionClasses = () => {
    const baseClasses = `absolute bg-secondary rounded-md shadow-lg ring-1 ring-black/5 focus:outline-none ${dropdownWidth} ${maxWidth}`;
    const verticalClasses = shouldOpenUpward
      ? 'bottom-full mb-2 origin-bottom'
      : 'top-full mt-2 origin-top';
    const horizontalClasses = shouldCenter
      ? 'left-1/2 -translate-x-1/2'
      : 'left-0';

    return `${baseClasses} ${verticalClasses} ${horizontalClasses}`;
  };

  return (
    <Menu as="div" className="relative inline-block text-left">
      <WithTooltip
        delayDuration={0}
        side="bottom"
        display={<div>Switch model ({displayName})</div>}
        trigger={
          <MenuButton
            ref={buttonRef}
            className="relative flex cursor-pointer items-center hover:opacity-50"
          >
            <Repeat size={iconSize} />
            <ChevronDown className="ml-1 opacity-50" size={16} />
          </MenuButton>
        }
      />

      <MenuItems className={getPositionClasses()}>
        <div className="p-1">
          <div className="px-3 py-2.5 text-sm text-muted-foreground">
            Switch model
          </div>

          {availableModels.map((model) => (
            <ModelItem
              key={model.id}
              model={model}
              isActive={false}
              onClick={() => onChangeModel(model.id)}
            />
          ))}

          <div className="mx-2 my-1 h-px bg-muted-foreground/50" />

          {currentModelData && (
            <ModelItem
              model={currentModelData}
              isActive={true}
              onClick={() => onChangeModel(currentModelData.id)}
            />
          )}
        </div>
      </MenuItems>
    </Menu>
  );
};
