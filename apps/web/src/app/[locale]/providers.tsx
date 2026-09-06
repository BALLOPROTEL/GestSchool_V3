'use client';

import { TooltipProvider } from '@gestschool/ui';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { AuthProvider } from '../../features/auth/auth-provider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" disableTransitionOnChange enableSystem>
      <TooltipProvider delayDuration={300}>
        <AuthProvider>{children}</AuthProvider>
        <Toaster closeButton position="bottom-right" richColors />
      </TooltipProvider>
    </ThemeProvider>
  );
}
