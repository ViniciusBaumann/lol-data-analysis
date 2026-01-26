import { AlertCircle } from 'lucide-react';

export function ErrorMessage({ message = 'Ocorreu um erro.' }: { message?: string }) {
  return (
    <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-red-400">
      <AlertCircle size={20} />
      <span className="text-sm">{message}</span>
    </div>
  );
}
