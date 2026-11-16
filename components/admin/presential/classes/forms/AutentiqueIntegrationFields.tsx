import React, { useEffect, useState } from 'react';
import { FileCheck2, FolderSync, RefreshCw, Clock, AlertCircle, Keyboard } from 'lucide-react';
import { Class } from '../../../../../types/class';
import { AutentiqueFolder } from '../../../../../types/autentique';
import { autentiqueAdminService } from '../../../../../services/autentiqueAdminService';

interface AutentiqueIntegrationFieldsProps {
  data: Partial<Class>;
  onChange: (updates: Partial<Class>) => void;
}

const PRESET_DAYS = [30, 60, 90, 180, 365];

export const AutentiqueIntegrationFields: React.FC<AutentiqueIntegrationFieldsProps> = ({
  data,
  onChange,
}) => {
  const [folders, setFolders] = useState<AutentiqueFolder[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [apiConfigured, setApiConfigured] = useState<boolean>(true);
  const [apiWarning, setApiWarning] = useState<string | null>(null);
  const [folderSearch, setFolderSearch] = useState('');
  const [manualMode, setManualMode] = useState(false);

  const loadFolders = async () => {
    setLoadingFolders(true);
    setApiWarning(null);
    try {
      const result = await autentiqueAdminService.fetchFolders();
      setApiConfigured(result.configured);
      setFolders(result.folders);
      if (result.warning) {
        setApiWarning(result.warning);
      }
      if (!result.configured) {
        setManualMode(true);
      }
    } catch (err: any) {
      setApiWarning(err?.message || 'Não foi possível consultar as pastas do Autentique.');
    } finally {
      setLoadingFolders(false);
    }
  };

  useEffect(() => {
    if (data.autentiqueEnabled) {
      loadFolders();
    }
  }, [data.autentiqueEnabled]);

  const handleToggleEnabled = () => {
    const nextEnabled = !data.autentiqueEnabled;
    onChange({
      autentiqueEnabled: nextEnabled,
      autentiqueAccessDays:
        Number(data.autentiqueAccessDays) > 0 ? Number(data.autentiqueAccessDays) : 60,
    });
  };

  const filteredFolders = folders.filter((f) => {
    if (!folderSearch.trim()) return true;
    const term = folderSearch.toLowerCase();
    return (
      f.name.toLowerCase().includes(term) ||
      (f.path || '').toLowerCase().includes(term) ||
      f.id.toLowerCase().includes(term)
    );
  });

  const currentAccessDays =
    data.autentiqueAccessDays !== undefined && data.autentiqueAccessDays !== null
      ? data.autentiqueAccessDays
      : 60;

  return (
    <div className="col-span-2 border-t border-zinc-800 pt-6">
      <div className="bg-zinc-900/70 border border-zinc-800 rounded-xl p-5 space-y-5">
        {/* Header + Toggle */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className={`p-2.5 rounded-lg border transition-colors ${
                data.autentiqueEnabled
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : 'bg-zinc-800 border-zinc-700 text-zinc-400'
              }`}
            >
              <FileCheck2 className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                  Automação de Contratos (Autentique)
                </h4>
                {data.autentiqueEnabled && (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase">
                    Ativa
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Assim que o aluno assinar o contrato na pasta vinculada, o sistema verifica o e-mail,
                cria o cadastro caso não exista e libera automaticamente esta turma presencial.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleToggleEnabled}
            aria-label="Alternar automação Autentique"
            className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 ${
              data.autentiqueEnabled ? 'bg-emerald-600' : 'bg-zinc-700'
            }`}
          >
            <div
              className={`w-4 h-4 bg-white rounded-full transition-transform ${
                data.autentiqueEnabled ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Expanded Configuration */}
        {data.autentiqueEnabled && (
          <div className="space-y-5 pt-4 border-t border-zinc-800/80">
            {(!apiConfigured || apiWarning) && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-950/30 border border-amber-500/30 text-xs text-amber-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <div className="space-y-1">
                  <p className="font-semibold">
                    {apiWarning || 'Token da API do Autentique não detectado no ambiente.'}
                  </p>
                  <p className="text-amber-400/80">
                    Defina <code className="font-mono text-amber-200">AUTENTIQUE_API_TOKEN</code> nas
                    variáveis de ambiente do servidor para listar as pastas automaticamente, ou
                    informe o ID da pasta manualmente abaixo.
                  </p>
                </div>
              </div>
            )}

            {/* Seleção da Pasta no Autentique */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <FolderSync className="w-3.5 h-3.5 text-emerald-400" />
                  Pasta de Contratos da Turma no Autentique *
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setManualMode((prev) => !prev)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[10px] font-bold text-zinc-300 uppercase transition-colors"
                  >
                    <Keyboard className="w-3 h-3" />
                    {manualMode ? 'Selecionar da Lista' : 'Digitar ID Manual'}
                  </button>

                  <button
                    type="button"
                    onClick={loadFolders}
                    disabled={loadingFolders}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-[10px] font-bold text-zinc-300 uppercase transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingFolders ? 'animate-spin' : ''}`} />
                    Atualizar Pastas
                  </button>
                </div>
              </div>

              {!manualMode ? (
                <div className="space-y-2">
                  {folders.length > 8 && (
                    <input
                      type="text"
                      value={folderSearch}
                      onChange={(e) => setFolderSearch(e.target.value)}
                      placeholder="Filtrar pastas pelo nome..."
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-red placeholder-zinc-600"
                    />
                  )}
                  <select
                    value={data.autentiqueFolderId || ''}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      const found = folders.find((f) => f.id === selectedId);
                      onChange({
                        autentiqueFolderId: selectedId || null,
                        autentiqueFolderName: found ? found.path || found.name : null,
                      });
                    }}
                    disabled={loadingFolders}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:border-brand-red transition-colors"
                  >
                    <option value="">
                      {loadingFolders
                        ? 'Carregando pastas do Autentique...'
                        : 'Selecione a pasta vinculada a esta turma...'}
                    </option>
                    {data.autentiqueFolderId &&
                      !folders.some((f) => f.id === data.autentiqueFolderId) && (
                        <option value={data.autentiqueFolderId}>
                          {data.autentiqueFolderName
                            ? `${data.autentiqueFolderName} (${data.autentiqueFolderId})`
                            : `Pasta vinculada (${data.autentiqueFolderId})`}
                        </option>
                      )}
                    {filteredFolders.map((folder) => (
                      <option key={folder.id} value={folder.id}>
                        {folder.path || folder.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <input
                      type="text"
                      value={data.autentiqueFolderId || ''}
                      onChange={(e) =>
                        onChange({ autentiqueFolderId: e.target.value.trim() || null })
                      }
                      placeholder="ID da Pasta no Autentique (UUID / Hash)"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-xs font-mono text-white focus:outline-none focus:border-brand-red placeholder-zinc-600"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={data.autentiqueFolderName || ''}
                      onChange={(e) =>
                        onChange({ autentiqueFolderName: e.target.value || null })
                      }
                      placeholder="Nome de referência da pasta (opcional)"
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-brand-red placeholder-zinc-600"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Prazo de Acesso (Padrão 60 dias, editável pelo Admin) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-brand-red" />
                  Prazo de Acesso Liberado (Dias) *
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min={1}
                      max={3650}
                      value={currentAccessDays}
                      onChange={(e) => {
                        const parsed = parseInt(e.target.value, 10);
                        onChange({
                          autentiqueAccessDays: isNaN(parsed) ? 0 : Math.max(0, parsed),
                        });
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 pr-14 text-sm font-mono tabular-nums text-white focus:outline-none focus:border-brand-red"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-zinc-500 uppercase">
                      Dias
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {PRESET_DAYS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => onChange({ autentiqueAccessDays: preset })}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono tabular-nums font-bold border transition-colors ${
                        currentAccessDays === preset
                          ? 'bg-brand-red/20 border-brand-red text-white'
                          : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                      }`}
                    >
                      {preset}d
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-zinc-500">
                  Padrão de 60 dias a contar da liberação, editável a qualquer momento pelo administrador.
                </p>
              </div>

              {/* E-mails adicionais da equipe para ignorar (Opcional) */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block">
                  E-mails Internos Ignorados (Opcional)
                </label>
                <input
                  type="text"
                  value={
                    Array.isArray(data.autentiqueIgnoreEmails)
                      ? data.autentiqueIgnoreEmails.join(', ')
                      : ''
                  }
                  onChange={(e) =>
                    onChange({
                      autentiqueIgnoreEmails: e.target.value
                        .split(',')
                        .map((item) => item.trim().toLowerCase())
                        .filter(Boolean),
                    })
                  }
                  placeholder="Ex: diretoria@gmail.com, secretaria@gmail.com"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2.5 text-xs text-white focus:outline-none focus:border-brand-red placeholder-zinc-600"
                />
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  O titular da conta Autentique, testemunhas e e-mails @insanus já são ignorados automaticamente.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
