import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="lg:ml-64 p-3 sm:p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
