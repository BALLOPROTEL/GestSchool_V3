'use client';

import { TooltipProvider } from '@gestschool/ui';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange enableSystem>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster closeButton position="bottom-right" richColors />
      </TooltipProvider>
    </ThemeProvider>
  );
}
