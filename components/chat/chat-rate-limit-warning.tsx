'use client';

import { PentestGPTContext } from '@/context/context';
import type { RateLimitInfo } from '@/types';
import { IconX } from '@tabler/icons-react';
import { useContext, useState } from 'react';
import { Button } from '@/components/ui/button';

interface RateLimitWarningProps {
  rateLimitInfo: RateLimitInfo;
}

const RateLimitWarning: React.FC<RateLimitWarningProps> = ({
  rateLimitInfo,
}) => {
  const [isDismissed, setIsDismissed] = useState(false);

  const { remaining, max, timeRemaining, feature, isPremiumUser } =
    rateLimitInfo;

  // Only show warning for pentestgpt models when remaining requests hit 1/5 of max, but not when 0
  const isPentestGPTModel =
    feature === 'pentestgpt' || feature === 'pentestgpt-pro';
  const threshold = Math.floor(max / 5);
  const shouldShowWarning =
    isPentestGPTModel && remaining > 0 && remaining <= threshold;

  const getFeatureDisplayName = (feature: string) => {
    switch (feature) {
      case 'pentestgpt':
        return 'Small Model';
      case 'pentestgpt-pro':
        return 'Large Model';
      case 'terminal':
        return 'Terminal';
      case 'stt-1':
        return 'Speech-to-text';
      case 'reasoning-model':
        return 'reasoning-model';
      case 'image-gen':
        return 'image-gen';
      case 'deep-research':
        return 'deep-research';
      default:
        return feature;
    }
  };

  const formatTimeUntilReset = (timeRemaining: number | null) => {
    if (!timeRemaining || timeRemaining <= 0) {
      return 'soon';
    }

    const hours = Math.floor(timeRemaining / (1000 * 60 * 60));
    const minutes = Math.floor(
      (timeRemaining % (1000 * 60 * 60)) / (1000 * 60),
    );

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m`;
    } else {
      // Less than a minute remaining
      const seconds = Math.floor(timeRemaining / 1000);
      return seconds > 0 ? `${seconds}s` : 'soon';
    }
  };

  if (!shouldShowWarning || isDismissed) {
    return null;
  }

  return (
    <div className="flex w-full justify-center">
      <div className="z-10 w-full max-w-[800px] items-end px-4 md:px-8">
        <div className="bg-secondary border-secondary relative w-full rounded-xl border-2">
          <div className="flex items-center justify-between p-3">
            <div className="flex-1">
              <p className="text-foreground text-sm font-bold">
                You have {remaining} responses from{' '}
                {getFeatureDisplayName(feature)} remaining.
              </p>
              {isPremiumUser ? (
                <p className="text-muted-foreground mt-1 text-sm">
                  If you hit the limit, responses will switch to another model
                  until it resets in {formatTimeUntilReset(timeRemaining)}.
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {isPremiumUser ? null : (
                <Button
                  size="sm"
                  className="rounded-full"
                  onClick={() => {
                    // Navigate to upgrade page or open upgrade modal
                    window.location.href = '/upgrade';
                  }}
                >
                  Get Pro
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-primary hover:text-foreground h-8 w-8 p-0"
                onClick={() => setIsDismissed(true)}
              >
                <IconX className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ChatRateLimitWarning: React.FC = () => {
  const { rateLimitInfo } = useContext(PentestGPTContext);

  if (!rateLimitInfo) {
    return null;
  }

  return <RateLimitWarning rateLimitInfo={rateLimitInfo} />;
};
