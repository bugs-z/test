import { useUIContext } from '@/context/ui-context';
import { PentestGPTContext } from '@/context/context';
import { useContext } from 'react';
import { toast } from 'sonner';

interface UseKeyboardHandlerProps {
  isTyping: boolean;
  isMobile: boolean;
  sendMessage: () => void;
  handleSelectDeviceFile: (file: File) => void;
}

export const useKeyboardHandler = ({
  isTyping,
  isMobile,
  sendMessage,
  handleSelectDeviceFile,
}: UseKeyboardHandlerProps) => {
  const { isToolPickerOpen, focusTool, setFocusTool } = useUIContext();
  const { isPremiumSubscription } = useContext(PentestGPTContext);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    // Handle send message on Enter
    if (!isTyping && event.key === 'Enter' && !event.shiftKey && !isMobile) {
      event.preventDefault();
      sendMessage();
    }

    // Handle tool picker navigation
    if (
      isToolPickerOpen &&
      ['Tab', 'ArrowUp', 'ArrowDown', 'Enter', 'Escape'].includes(event.key)
    ) {
      event.preventDefault();
      if (!focusTool) setFocusTool(true);
    }
  };

  const handlePaste = (event: React.ClipboardEvent) => {
    const items = event.clipboardData.items;
    for (const item of items) {
      if (item.type.indexOf('image') === 0) {
        if (!isPremiumSubscription) {
          toast.error(
            'Image uploads are only available for pro and team users. Please upgrade to upload images.',
          );
          return;
        }
        const file = item.getAsFile();
        if (!file) return;
        handleSelectDeviceFile(file);
      }
    }
  };

  return { handleKeyDown, handlePaste };
};
