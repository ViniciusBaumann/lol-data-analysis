import { useState, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { cn } from '@/lib/utils';

const STORAGE_KEY = 'sidebar-collapsed';

function getInitialCollapsed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed);

  const handleToggle = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, String(next)); } catch {}
      return next;
    });
  }, []);

  // Sidebar width (60 or 248) + left offset (12) + gap (12) = 84 or 272
  return (
    <div className="min-h-screen bg-background">
      <Sidebar collapsed={collapsed} onToggle={handleToggle} />
      <main
        className={cn(
          "p-3 sm:p-6 lg:p-8 transition-[margin-left] duration-200",
          collapsed ? "lg:ml-[84px]" : "lg:ml-[272px]"
        )}
      >
        <Outlet />
      </main>
    </div>
  );
}
