import Image from 'next/image';
import type { MessageImage } from '@/types';
import { cn } from '@/lib/utils';
import { Button } from '../ui/button';
import { Download } from 'lucide-react';
import { useState } from 'react';

interface MessageImagesProps {
  imagePaths: string[];
  chatImages: MessageImage[];
  messageId: string;
  isAssistant: boolean;
  onImageClick: (image: MessageImage) => void;
}

export const MessageImages: React.FC<MessageImagesProps> = ({
  imagePaths,
  chatImages,
  messageId,
  isAssistant,
  onImageClick,
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (imagePaths.length === 0) return null;

  const handleDownload = (src: string, index: number) => {
    const link = document.createElement('a');
    link.href = src;
    link.download = `image-${messageId}-${index}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      className={cn(
        'flex flex-wrap gap-2',
        isAssistant ? 'justify-start' : 'justify-end',
      )}
    >
      {imagePaths.map((path, index) => {
        const item = chatImages.find((image) => image.path === path);

        // Use URL as primary source, fallback to base64 for loading states (data URLs)
        const src = item?.url || (path.startsWith('data:') ? path : '');

        if (!src) return null;

        return (
          <div
            key={index}
            className="relative"
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            <Image
              className={cn(
                'mb-2 cursor-pointer rounded hover:opacity-80 transition-opacity',
                'w-full h-auto object-contain',
                isAssistant ? 'max-w-[480px]' : 'max-w-64 max-h-64',
              )}
              src={src}
              alt="message image"
              // Enable optimization for message images with proper sizing
              width={isAssistant ? 480 : 256}
              height={isAssistant ? 480 : 256}
              // Enable optimization for message images by not setting unoptimized
              // unoptimized={false} // This is the default, so we don't need to set it
              onClick={() => {
                onImageClick({
                  messageId,
                  path,
                  url: item?.url || '',
                  file: null,
                });
              }}
              loading="lazy"
              // Add sizes prop for responsive optimization
              sizes={
                isAssistant
                  ? '(max-width: 768px) 100vw, 480px'
                  : '(max-width: 768px) 100vw, 256px'
              }
            />
            {isAssistant && hoveredIndex === index && (
              <Button
                size="sm"
                variant="secondary"
                className="absolute top-2 right-2 h-8 w-8 p-0 opacity-90 hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDownload(src, index);
                }}
              >
                <Download className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
};
