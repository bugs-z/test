import type { FC } from 'react';
import { Button } from '../../ui/button';
import { Label } from '../../ui/label';
import { ThemeSwitcher } from '../theme-switcher';
import { LogOut } from 'lucide-react';

interface GeneralTabProps {
  handleDeleteAllChats: () => void;
  handleSignOut: () => void;
}

export const GeneralTab: FC<GeneralTabProps> = ({
  handleDeleteAllChats,
  handleSignOut,
}) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Theme</Label>
        <ThemeSwitcher />
      </div>

      <div className="flex items-center justify-between">
        <Label>Delete all chats</Label>
        <Button variant="destructive" onClick={handleDeleteAllChats}>
          Delete all
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <Label>Log out</Label>
        <Button
          variant="secondary"
          onClick={handleSignOut}
          className="flex items-center"
        >
          <LogOut className="mr-2" size={18} />
          Log out
        </Button>
      </div>
    </div>
  );
};
