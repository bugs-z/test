import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface UpgradePromptProps {
  title?: string;
  buttonText?: string;
  variant?: 'modal' | 'tooltip';
  onClose?: () => void;
  feature?:
    | 'deep research'
    | 'terminal'
    | 'file upload'
    | 'websearch'
    | 'image generation';
}

const getDescription = (feature: string) => {
  switch (feature) {
    case 'deep research':
      return 'Get access to deep research and more features with Pro';
    case 'terminal':
      return 'Get access to terminal and more features with Pro';
    case 'file upload':
      return 'Get access to file upload and more features with Pro';
    case 'websearch':
      return 'Get access to web search and more features with Pro';
    case 'image generation':
      return 'Get access to image generation and more features with Pro';
    default:
      return 'Get access to more features with Pro';
  }
};

const UpgradePrompt = ({
  title = 'Upgrade to Pro',
  buttonText = 'Upgrade Now',
  variant = 'tooltip',
  onClose,
  feature = 'terminal',
}: UpgradePromptProps) => {
  const router = useRouter();

  return (
    <div
      className={cn(
        'bg-background rounded-lg space-y-3',
        variant === 'tooltip' ? 'w-[240px] p-1' : 'p-6',
      )}
    >
      <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground">{getDescription(feature)}</p>
      <Button
        variant="default"
        className="w-full"
        onClick={() => router.push('/upgrade')}
      >
        {buttonText}
      </Button>
      {variant === 'modal' && onClose && (
        <button
          className="mt-4 w-full rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
          onClick={onClose}
        >
          Close
        </button>
      )}
    </div>
  );
};

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  feature:
    | 'deep research'
    | 'terminal'
    | 'file upload'
    | 'websearch'
    | 'image generation';
}

export const UpgradeModal = ({
  isOpen,
  onClose,
  feature,
}: UpgradeModalProps) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <UpgradePrompt
        variant="modal"
        title="Upgrade to Pro"
        buttonText="Upgrade Now"
        onClose={onClose}
        feature={feature}
      />
    </div>
  );
};

export { UpgradePrompt };
