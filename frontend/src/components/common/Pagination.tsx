import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className={cn(
          "p-2 rounded-lg border border-border transition-colors",
          page <= 1 ? "opacity-50 cursor-not-allowed" : "hover:bg-secondary"
        )}
      >
        <ChevronLeft size={16} />
      </button>
      <span className="text-sm text-muted-foreground px-3">
        {page} / {totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className={cn(
          "p-2 rounded-lg border border-border transition-colors",
          page >= totalPages ? "opacity-50 cursor-not-allowed" : "hover:bg-secondary"
        )}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
