import { Settings, Loader2, CheckCircle, AlertCircle, Database } from 'lucide-react';
import { useState } from 'react';
import { triggerImport, ImportResult } from '@/services/settings';

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const data = await triggerImport(2026);
      setResult(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Erro ao importar dados.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Settings size={28} className="text-primary" />
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Database size={20} className="text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Atualizar Dados</h2>
        </div>

        <p className="text-sm text-muted-foreground">
          Importa os dados mais recentes do Oracle's Elixir para o ano selecionado.
          O processo pode levar alguns minutos.
        </p>

        <button
          onClick={handleImport}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 size={16} className="animate-spin" />
              Importando dados...
            </>
          ) : (
            'Atualizar Dados 2026'
          )}
        </button>

        {result && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-green-500 font-medium">
              <CheckCircle size={18} />
              Importação concluída
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Status</p>
                <p className="font-medium text-foreground">{result.status}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Linhas processadas</p>
                <p className="font-medium text-foreground">{result.rows_processed.toLocaleString('pt-BR')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Partidas criadas</p>
                <p className="font-medium text-foreground">{result.matches_created.toLocaleString('pt-BR')}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Partidas ignoradas</p>
                <p className="font-medium text-foreground">{result.matches_skipped.toLocaleString('pt-BR')}</p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 text-red-500 font-medium">
              <AlertCircle size={18} />
              {error}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
