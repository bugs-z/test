import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SquareTerminal } from 'lucide-react';
import { useUIContext } from '@/context/ui-context';
import { useAgentModePreference } from './use-auto-run-preference';
import { useChatHandler } from '@/components/chat/chat-hooks/use-chat-handler';
import { TextareaAutosize } from '@/components/ui/textarea-autosize';

interface AskTerminalCommandBlockProps {
  command: string;
  execDir: string;
}

export const AskTerminalCommandBlock: React.FC<
  AskTerminalCommandBlockProps
> = ({ command, execDir }) => {
  const { isMobile } = useUIContext();
  const { agentMode, setAgentMode } = useAgentModePreference();
  const { handleSendConfirmTerminalCommand } = useChatHandler();

  const extractCommand = (content: string) => {
    const matches = [
      ...content.matchAll(
        /<terminal-command[^>]*>([^<]*)<\/terminal-command>/g,
      ),
    ];
    return matches.length ? matches[matches.length - 1][1].trim() : content;
  };

  const handleConfirm = () => handleSendConfirmTerminalCommand();
  const handleKeyDown = (e: React.KeyboardEvent) =>
    e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleConfirm());

  return (
    <div className="overflow-hidden rounded-lg border border-border my-3">
      <div className="flex flex-col bg-muted px-4 py-2">
        <div className="flex items-center text-xs text-muted-foreground mb-1">
          <SquareTerminal size={16} className="mr-2" />
          <span>{execDir}</span>
        </div>
        <div className="text-sm">
          <TextareaAutosize
            value={extractCommand(command)}
            onValueChange={() => {}}
            onKeyDown={handleKeyDown}
            className="font-mono text-foreground/80 break-all whitespace-pre-wrap bg-transparent border-0 p-0 ring-0 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 outline-none"
            minRows={1}
            maxRows={10}
            disabled={true}
          />
        </div>
      </div>
      <div className="flex items-center justify-between px-4 py-2 bg-muted">
        {!isMobile && (
          <Select value={agentMode} onValueChange={setAgentMode}>
            <SelectTrigger className="w-[160px] h-8 text-sm">
              <SelectValue placeholder="Ask every time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ask-every-time">Ask every time</SelectItem>
              <SelectItem value="auto-run">Auto run</SelectItem>
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="default"
            size="sm"
            className="h-8"
            onClick={handleConfirm}
          >
            Run command
          </Button>
        </div>
      </div>
    </div>
  );
};
