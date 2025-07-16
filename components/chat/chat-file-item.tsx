import {
  IconFileFilled,
  IconFileTypeCsv,
  IconFileTypeDocx,
  IconFileTypePdf,
  IconFileTypeTxt,
  IconJson,
  IconLoader2,
  IconMarkdown,
  IconX,
} from '@tabler/icons-react';
import type { FC } from 'react';
import { WithTooltip } from '../ui/with-tooltip';
import type { Doc, Id } from '@/convex/_generated/dataModel';

interface FileItemProps {
  file: Doc<'files'>;
  isLoading?: boolean;
  showRemoveButton: boolean;
  onRemove?: (fileId: Id<'files'>) => void;
  onClick?: () => void;
}

export const ChatFileItem: FC<FileItemProps> = ({
  file,
  isLoading,
  showRemoveButton,
  onRemove,
  onClick,
}) => {
  const getFileIcon = () => {
    const fileExtension = file.type?.includes('/')
      ? file.type.split('/')[1]
      : file.type;

    switch (fileExtension) {
      case 'pdf':
        return <IconFileTypePdf className="h-6 w-6 text-white" />;
      case 'markdown':
        return <IconMarkdown className="h-6 w-6 text-white" />;
      case 'txt':
        return <IconFileTypeTxt className="h-6 w-6 text-white" />;
      case 'json':
        return <IconJson className="h-6 w-6 text-white" />;
      case 'csv':
        return <IconFileTypeCsv className="h-6 w-6 text-white" />;
      case 'docx':
        return <IconFileTypeDocx className="h-6 w-6 text-white" />;
      default:
        return <IconFileFilled className="h-6 w-6 text-white" />;
    }
  };

  if (isLoading) {
    return (
      <div className="group relative inline-block text-sm">
        <div className="cursor-pointer">
          <div className="bg-secondary relative overflow-hidden border rounded-xl">
            <div className="p-2 w-60 sm:w-80">
              <div className="flex flex-row items-center gap-2">
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-blue-500 flex items-center justify-center">
                  <IconLoader2 className="h-6 w-6 text-white animate-spin" />
                </div>
                <div className="overflow-hidden">
                  <div className="truncate font-semibold">{file.name}</div>
                  <div className="truncate opacity-50">
                    {file.type || 'File'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative inline-block text-sm">
      <div className="cursor-pointer" onClick={onClick}>
        <div className="bg-secondary relative overflow-hidden border rounded-xl hover:opacity-50 transition-opacity">
          <div className="p-2 w-60 sm:w-80">
            <div className="flex flex-row items-center gap-2">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-blue-500 flex items-center justify-center">
                {getFileIcon()}
              </div>
              <div className="overflow-hidden">
                <div className="truncate font-semibold">{file.name}</div>
                <div className="truncate opacity-50">File</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showRemoveButton && (
        <div className="absolute end-1.5 top-1.5 inline-flex gap-1">
          <WithTooltip
            delayDuration={0}
            side="top"
            display={<div>Remove file</div>}
            trigger={
              <IconX
                className="bg-secondary border-primary flex size-5 cursor-pointer items-center justify-center rounded-full border text-[10px] hover:border-red-500 hover:bg-white hover:text-red-500"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove?.(file._id);
                }}
              />
            }
          />
        </div>
      )}
    </div>
  );
};
