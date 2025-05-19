import { IconPlayerStopFilled, IconArrowUp } from '@tabler/icons-react';
import { cn } from '@/lib/utils';
import type { FC } from 'react';
import { WithTooltip } from '../ui/with-tooltip';

interface ChatSendButtonProps {
  isGenerating: boolean;
  canSend: boolean;
  onSend: () => void;
  onStop: () => void;
  isFileLoading?: boolean;
}

export const ChatSendButton: FC<ChatSendButtonProps> = ({
  isGenerating,
  canSend,
  onSend,
  onStop,
  isFileLoading,
}) => {
  if (isGenerating) {
    return (
      <IconPlayerStopFilled
        className="md:hover:bg-background animate-pulse rounded bg-transparent p-1 md:hover:opacity-50"
        onClick={onStop}
        size={30}
      />
    );
  }

  return (
    <WithTooltip
      display={!canSend && isFileLoading ? 'File upload pending' : undefined}
      trigger={
        <IconArrowUp
          className={cn(
            'bg-primary text-secondary rounded p-1 hover:opacity-50',
            !canSend && 'cursor-not-allowed opacity-50',
          )}
          stroke={2.5}
          onClick={onSend}
          size={30}
        />
      }
    />
  );
};
