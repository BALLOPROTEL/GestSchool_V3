'use client';

import { FileText, Upload, X } from 'lucide-react';
import * as React from 'react';

import { Button } from './button';
import { cn } from './lib/cn';

export type FileUploadProperties = {
  accept?: string;
  className?: string;
  labels: {
    browse: string;
    clear: string;
    drop: string;
    hint: string;
  };
  onFileChange?: (file: File | undefined) => void;
};

export function FileUpload({
  accept = '.pdf,.doc,.docx,.xls,.xlsx',
  className,
  labels,
  onFileChange,
}: FileUploadProperties) {
  const [dragging, setDragging] = React.useState(false);
  const [file, setFile] = React.useState<File>();
  const inputReference = React.useRef<HTMLInputElement>(null);

  const chooseFile = (nextFile: File | undefined) => {
    setFile(nextFile);
    onFileChange?.(nextFile);
  };

  return (
    <div
      className={cn(
        'rounded-xl border-2 border-dashed border-border p-6 text-center transition-colors',
        dragging && 'border-primary bg-primary/5',
        className,
      )}
      onDragEnter={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        chooseFile(event.dataTransfer.files.item(0) ?? undefined);
      }}
    >
      <input
        ref={inputReference}
        accept={accept}
        aria-label={labels.browse}
        className="sr-only"
        onChange={(event) => chooseFile(event.target.files?.item(0) ?? undefined)}
        type="file"
      />
      {file ? (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <FileText aria-hidden="true" className="size-5 text-primary" />
          <span className="max-w-full truncate text-sm font-medium">{file.name}</span>
          <Button
            aria-label={labels.clear}
            onClick={() => {
              chooseFile(undefined);
              if (inputReference.current) inputReference.current.value = '';
            }}
            size="icon-sm"
            variant="ghost"
          >
            <X />
          </Button>
        </div>
      ) : (
        <>
          <Upload aria-hidden="true" className="mx-auto mb-2 size-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">{labels.drop}</p>
          <Button
            className="mt-2"
            onClick={() => inputReference.current?.click()}
            size="sm"
            variant="link"
          >
            {labels.browse}
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">{labels.hint}</p>
        </>
      )}
    </div>
  );
}
