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
  const [loadedImages, setLoadedImages] = useState<Set<number>>(new Set());

  if (imagePaths.length === 0) return null;

  const handleDownload = (src: string, index: number) => {
    const link = document.createElement('a');
    link.href = src;
    link.download = `image-${messageId}-${index}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImageLoad = (index: number) => {
    setLoadedImages((prev) => new Set([...prev, index]));
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
        const src = item?.url || (path.startsWith('data:') ? path : '');
        const isLoaded = loadedImages.has(index);
        const dimensions = isAssistant ? 480 : 256;

        return (
          <div
            key={index}
            className={cn(
              'relative bg-muted rounded mb-2 overflow-hidden',
              isAssistant ? 'max-w-[480px]' : 'max-w-64',
            )}
            style={{
              width: `${dimensions}px`,
              minHeight: !isLoaded ? `${dimensions}px` : 'auto',
            }}
            onMouseEnter={() => setHoveredIndex(index)}
            onMouseLeave={() => setHoveredIndex(null)}
          >
            {/* Skeleton/Placeholder */}
            {!isLoaded && (
              <div className="absolute inset-0 bg-muted animate-pulse flex items-center justify-center">
                <div className="text-muted-foreground text-sm">Loading...</div>
              </div>
            )}

            {/* Actual Image */}
            {src && (
              <Image
                className={cn(
                  'cursor-pointer hover:opacity-80 transition-all duration-300 ease-in-out w-full h-auto object-contain',
                  !isLoaded && 'opacity-0',
                )}
                src={src}
                alt="message image"
                width={dimensions}
                height={dimensions}
                onClick={() => {
                  if (isLoaded) {
                    onImageClick({
                      messageId,
                      path,
                      url: item?.url || '',
                      file: null,
                    });
                  }
                }}
                loading="lazy"
                sizes={
                  isAssistant
                    ? '(max-width: 768px) 100vw, 480px'
                    : '(max-width: 768px) 100vw, 256px'
                }
                onLoad={() => handleImageLoad(index)}
              />
            )}

            {/* Download Button */}
            {isAssistant && hoveredIndex === index && isLoaded && src && (
              <Button
                size="sm"
                variant="secondary"
                className="absolute top-2 right-2 h-8 w-8 p-0 opacity-90 hover:opacity-100 z-10"
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
