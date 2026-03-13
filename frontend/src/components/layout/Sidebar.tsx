import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, GitCompare, Crosshair, Shield, Radio, Menu, X, Settings, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/live', label: 'Ao Vivo', icon: Radio },
  { path: '/teams', label: 'Ligas', icon: Users },
  { path: '/compare', label: 'Comparar', icon: GitCompare },
  { path: '/draft', label: 'Draft', icon: Crosshair },
  { path: '/matchups', label: 'Matchups', icon: Shield },
  { path: '/settings', label: 'Configurações', icon: Settings },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-md bg-card border border-border text-foreground"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile sidebar */}
      <aside className={cn(
        "fixed top-3 left-3 bottom-3 z-40 w-[248px] bg-card border border-border rounded-lg flex flex-col transition-transform duration-200 lg:hidden",
        mobileOpen ? "translate-x-0" : "-translate-x-[calc(100%+12px)]"
      )}>
        <div className="p-4 border-b border-border">
          <Link to="/" className="flex items-center gap-3" onClick={() => setMobileOpen(false)}>
            <img src="/icon.png" alt="ProbLens" className="h-8 w-8 object-contain shrink-0" />
            <span className="text-base font-bold text-foreground">ProbLens</span>
          </Link>
        </div>
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.map(item => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <item.icon size={18} className="shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Desktop floating sidebar */}
      <aside
        className="hidden lg:flex fixed top-3 left-3 z-40 bg-card border border-border rounded-lg flex-col transition-[width] duration-200 overflow-hidden"
        style={{ width: collapsed ? 60 : 248 }}
      >
        {/* Logo */}
        <div className={cn(
          "border-b border-border shrink-0",
          collapsed ? "p-2 flex items-center justify-center" : "p-4"
        )}>
          <Link to="/" className="flex items-center gap-3 min-w-0">
            <img src="/icon.png" alt="ProbLens" className="h-8 w-8 object-contain shrink-0" />
            {!collapsed && (
              <span className="text-base font-bold text-foreground whitespace-nowrap overflow-hidden">ProbLens</span>
            )}
          </Link>
        </div>

        {/* Nav items */}
        <nav className={cn(
          "space-y-0.5 overflow-x-hidden",
          collapsed ? "p-1.5" : "p-2"
        )}>
          {navItems.map(item => {
            const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                to={item.path}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center rounded-md text-sm font-medium transition-colors",
                  collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}
              >
                <item.icon size={18} className="shrink-0" />
                {!collapsed && (
                  <span className="whitespace-nowrap overflow-hidden">{item.label}</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <div className="border-t border-border p-2 shrink-0">
          <button
            onClick={onToggle}
            className={cn(
              "flex items-center rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors w-full",
              collapsed ? "justify-center p-2.5" : "gap-3 px-3 py-2.5"
            )}
          >
            {collapsed ? <ChevronsRight size={18} /> : <ChevronsLeft size={18} />}
            {!collapsed && <span className="whitespace-nowrap overflow-hidden">Recolher</span>}
          </button>
        </div>
      </aside>
    </>
  );
}
