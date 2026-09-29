'use client';

import { usePathname } from 'next/navigation';
import { Search, Bell } from 'lucide-react';
import { Input } from '@/components/ui/input';

const titleMap: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/surveys': 'Surveys',
  '/responses': 'Responses',
  '/automations': 'Automations',
  '/settings': 'Settings',
};

export function Topbar() {
  const pathname = usePathname();
  const segments = pathname.split('/').filter(Boolean);
  const basePath = '/' + (segments[0] || 'dashboard');
  const title = titleMap[basePath] || 'FeedbackFlow';

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card px-6">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <div className="flex items-center gap-3">
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search…"
            className="h-9 w-56 pl-9 text-sm"
          />
        </div>
        <button className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
          <Bell className="h-[18px] w-[18px]" />
        </button>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
          DU
        </div>
      </div>
    </header>
  );
}
