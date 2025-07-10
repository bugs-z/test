import { cn } from '@/lib/utils';
import type { MessageImage } from '@/types';
import { File, Download, X } from 'lucide-react';
import Image from 'next/image';
import { Dialog, DialogContent } from './dialog';
import { DialogTitle } from '@radix-ui/react-dialog';
import type { Doc } from '@/convex/_generated/dataModel';
import { Button } from './button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './tooltip';
import { useState } from 'react';

interface FilePreviewProps {
  type: 'image' | 'file' | 'file_item';
  item: Doc<'files'> | MessageImage | Doc<'file_items'>;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

export default function FilePreview({
  type,
  item,
  isOpen,
  onOpenChange,
}: FilePreviewProps) {
  const [isImageLoading, setIsImageLoading] = useState(true);

  const handleDownload = async () => {
    if (type === 'image') {
      const imageItem = item as MessageImage;
      const src = imageItem.url || imageItem.base64 || '';
      if (!src) return;

      try {
        // If it's a data URL (base64), download directly
        if (src.startsWith('data:')) {
          const link = document.createElement('a');
          link.href = src;
          link.download = `image-${imageItem.messageId || 'preview'}.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          return;
        }

        // For URLs, fetch the image and create a blob for download
        const response = await fetch(src);
        if (!response.ok) {
          throw new Error('Failed to fetch image');
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = url;
        link.download = `image-${imageItem.messageId || 'preview'}.png`;
        document.body.appendChild(link);
        link.click();

        // Cleanup
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (error) {
        console.error('Error downloading image:', error);
        // Fallback to direct link if fetch fails
        const link = document.createElement('a');
        link.href = src;
        link.download = `image-${imageItem.messageId || 'preview'}.png`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  const handleImageLoad = () => {
    setIsImageLoading(false);
  };

  const handleImageError = () => {
    setIsImageLoading(false);
  };

  // Reset loading states when dialog opens
  const handleOpenChange = (open: boolean) => {
    if (open) {
      setIsImageLoading(true);
    }
    onOpenChange(open);
  };

  return (
    <TooltipProvider>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogContent
          className={cn(
            'max-w-full max-h-full w-full h-full p-0 border-none',
            'bg-black flex items-center justify-center',
          )}
        >
          <DialogTitle className="sr-only">File Preview</DialogTitle>

          {/* Loading Indicator */}
          {type === 'image' && isImageLoading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-40">
              <div className="bg-white/10 backdrop-blur-md rounded-lg p-6 flex items-center space-x-3">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div>
                <span className="text-white text-sm">Loading...</span>
              </div>
            </div>
          )}

          {/* Close button on the top left */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="absolute top-6 left-6 h-10 w-10 p-0 z-50 text-white hover:bg-white/20 border-none"
                onClick={handleClose}
              >
                <X className="h-6 w-6" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Close</p>
            </TooltipContent>
          </Tooltip>

          {/* Download button on the top right (only for images) */}
          {type === 'image' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="absolute top-6 right-6 h-10 w-10 p-0 z-50 text-white hover:bg-white/20 border-none"
                  onClick={handleDownload}
                >
                  <Download className="h-6 w-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Save</p>
              </TooltipContent>
            </Tooltip>
          )}

          {(() => {
            if (type === 'image') {
              const imageItem = item as MessageImage;
              const src = imageItem.url || imageItem.base64 || '';

              return (
                <Image
                  className={cn(
                    'object-contain transition-opacity duration-300',
                    isImageLoading ? 'opacity-0' : 'opacity-100',
                  )}
                  src={src}
                  alt="File image"
                  width={1200}
                  height={800}
                  style={{
                    maxHeight: '80vh',
                    maxWidth: '80vw',
                  }}
                  // Enable optimization for full-size image previews
                  sizes="(max-width: 768px) 95vw, 80vw"
                  onLoad={handleImageLoad}
                  onError={handleImageError}
                />
              );
            } else if (type === 'file_item') {
              const fileItem = item as Doc<'file_items'>;
              return (
                <div className="bg-background text-primary max-h-[75vh] max-w-[95vw] overflow-auto whitespace-pre-wrap rounded-xl p-4 shadow-lg md:min-w-[50vw] lg:min-w-[700px]">
                  <div className="text-lg leading-relaxed">
                    {fileItem.content}
                  </div>
                </div>
              );
            } else if (type === 'file') {
              return (
                <div className="rounded bg-blue-500 p-2">
                  <File />
                </div>
              );
            }
          })()}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
