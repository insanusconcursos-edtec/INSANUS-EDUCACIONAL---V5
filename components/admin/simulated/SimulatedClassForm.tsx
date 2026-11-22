import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Upload, Image as ImageIcon, Loader2, Trophy, Users, MapPin, Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { ClassRankingConfig, RankingMode, SimulatedClass } from '../../../services/simulatedService';
import { Category } from '../../../services/planService';
import { createDefaultRankingConfig, getTotalVacancies, normalizeRankingConfig } from '../../../utils/simulatedRanking';

interface SimulatedClassFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<SimulatedClass, 'id' | 'createdAt'>, coverFile?: File) => Promise<void>;
  initialData?: SimulatedClass | null;
  categories: Category[];
  loading?: boolean;
}

const SimulatedClassForm: React.FC<SimulatedClassFormProps> = ({ 
  isOpen, onClose, onSave, initialData, categories, loading = false 
}) => {
  const [formData, setFormData] = useState({
    title: '',
    categoryId: '',
    subcategoryId: '',
    organization: '',
    buyLink: '',
    presentationVideoUrl: '',
    coverUrl: '', // URL existente
    published: true,
    draftWhitelist: [] as string[],
    excludeFromFreePass: false,
    isBlocked: false,
    unlockDate: ''
  });
  const [rankingConfig, setRankingConfig] = useState<ClassRankingConfig>(createDefaultRankingConfig());
  const [rankingError, setRankingError] = useState<string>('');
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load Initial Data
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          title: initialData.title,
          categoryId: initialData.categoryId,
          subcategoryId: initialData.subcategoryId,
          organization: initialData.organization,
          buyLink: initialData.buyLink,
          presentationVideoUrl: initialData.presentationVideoUrl || '',
          coverUrl: initialData.coverUrl,
          published: initialData.published !== false,
          draftWhitelist: initialData.draftWhitelist || [],
          excludeFromFreePass: !!initialData.excludeFromFreePass,
          isBlocked: !!initialData.isBlocked,
          unlockDate: initialData.unlockDate || ''
        });
        setRankingConfig(normalizeRankingConfig(initialData.rankingConfig));
        setPreviewUrl(initialData.coverUrl);
      } else {
        // Reset
        setFormData({
          title: '',
          categoryId: '',
          subcategoryId: '',
          organization: '',
          buyLink: '',
          presentationVideoUrl: '',
          coverUrl: '',
          published: true,
          draftWhitelist: [],
          excludeFromFreePass: false,
          isBlocked: false,
          unlockDate: ''
        });
        setRankingConfig(createDefaultRankingConfig());
        setPreviewUrl('');
      }
      setRankingError('');
      setSelectedFile(null);
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleRankingModeChange = (mode: RankingMode) => {
    setRankingError('');
    setRankingConfig((prev) => ({
      ...prev,
      mode,
      regions:
        mode === 'regional' && (!prev.regions || prev.regions.length === 0)
          ? [{ id: crypto.randomUUID(), name: '', immediate: 0, reserve: 0 }]
          : prev.regions || []
    }));
  };

  const handleAddRegion = () => {
    setRankingError('');
    setRankingConfig((prev) => ({
      ...prev,
      regions: [
        ...(prev.regions || []),
        { id: crypto.randomUUID(), name: '', immediate: 0, reserve: 0 }
      ]
    }));
  };

  const handleRegionChange = (
    regionId: string,
    field: 'name' | 'immediate' | 'reserve',
    value: string | number
  ) => {
    setRankingError('');
    setRankingConfig((prev) => ({
      ...prev,
      regions: (prev.regions || []).map((region) =>
        region.id === regionId
          ? {
              ...region,
              [field]: field === 'name' ? String(value) : Math.max(0, Number(value) || 0)
            }
          : region
      )
    }));
  };

  const handleRemoveRegion = (regionId: string) => {
    setRankingError('');
    setRankingConfig((prev) => ({
      ...prev,
      regions: (prev.regions || []).filter((region) => region.id !== regionId)
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedRanking = normalizeRankingConfig(rankingConfig);
    if (normalizedRanking.mode === 'regional') {
      const validRegions = (normalizedRanking.regions || []).filter((r) => r.name.trim().length > 0);
      if (validRegions.length === 0) {
        const msg = 'Cadastre pelo menos uma região com nome para usar o Ranking Regional.';
        setRankingError(msg);
        toast.error(msg, {
          style: { background: '#18181b', color: '#fff', border: '1px solid #3f3f46' }
        });
        return;
      }
      normalizedRanking.regions = validRegions;
    }

    await onSave({
        ...formData,
        rankingConfig: normalizedRanking
    }, selectedFile || undefined);
  };

  const totalVacanciesPreview = getTotalVacancies(rankingConfig);

  // Subcategories logic
  const activeCategory = categories.find(c => c.id === formData.categoryId); // Note: Assuming planService categories use ID or Name consistently. Based on previous implementation, category select usually used Name, but here schema says categoryId.
  // Adapting based on PlanService which used Names for category/subcategory in schema, but Simulated schema asked for IDs.
  // Assuming we use names as IDs for simplicity or matching existing structure if possible. 
  // Let's assume we store the ID here but display Name.
  
  const subcategories = activeCategory ? activeCategory.subcategories : [];

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative w-full max-w-2xl bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-zinc-900 flex items-center justify-between bg-zinc-900/50">
          <h2 className="text-xl font-black text-white uppercase tracking-tighter">
            {initialData ? 'Editar Turma' : 'Nova Turma de Simulados'}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          
          {/* Image Upload */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Capa da Turma</label>
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />
            <div 
              onClick={() => fileInputRef.current?.click()}
              className={`group relative w-full h-40 border-2 border-dashed rounded-xl overflow-hidden cursor-pointer transition-all ${
                previewUrl ? 'border-zinc-800 hover:border-brand-red/50' : 'border-zinc-800 hover:border-zinc-600 bg-zinc-900/50'
              }`}
            >
              {previewUrl ? (
                <>
                  <img src={previewUrl} alt="Preview" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="flex items-center gap-2 text-white font-bold text-xs uppercase tracking-widest">
                      <Upload size={16} /> Trocar Imagem
                    </span>
                  </div>
                </>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-500 group-hover:text-zinc-300 transition-colors">
                  <div className="p-4 rounded-full bg-zinc-900 border border-zinc-800 group-hover:border-brand-red/30 transition-colors">
                    <ImageIcon size={24} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest">Selecionar Capa</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Nome da Turma</label>
            <input 
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="EX: TURMA ELITE - POLÍCIA FEDERAL"
                required
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-brand-red uppercase font-bold"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Categoria</label>
                <select 
                    name="categoryId"
                    value={formData.categoryId}
                    onChange={handleChange}
                    required
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-xs text-white focus:outline-none focus:border-brand-red uppercase"
                >
                    <option value="">Selecione</option>
                    {categories.map(cat => (
                        // Usando ID se disponível, ou Name como fallback conforme arquitetura
                        <option key={cat.id} value={cat.id || cat.name}>{cat.name}</option>
                    ))}
                </select>
            </div>
            <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Subcategoria</label>
                <select 
                    name="subcategoryId"
                    value={formData.subcategoryId}
                    onChange={handleChange}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-xs text-white focus:outline-none focus:border-brand-red uppercase"
                >
                    <option value="">Selecione</option>
                    {subcategories.map((sub, idx) => (
                        <option key={idx} value={sub}>{sub}</option>
                    ))}
                </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Órgão / Instituição</label>
            <input 
                name="organization"
                value={formData.organization}
                onChange={handleChange}
                placeholder="EX: PF, PRF, PC-SP"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-brand-red uppercase font-bold"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Link de Venda (Opcional)</label>
            <input 
                name="buyLink"
                value={formData.buyLink}
                onChange={handleChange}
                placeholder="https://..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-brand-red"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Vídeo de Apresentação (Panda Video - Opcional)</label>
            <input 
                type="url"
                name="presentationVideoUrl"
                value={formData.presentationVideoUrl}
                onChange={handleChange}
                placeholder="https://player-vz-...tv.pandavideo.com.br/embed/?v=..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-brand-red"
            />
          </div>

          {/* REGRAS DE RANKING E VAGAS */}
          <div className="bg-[#14161c] p-4 rounded-xl border border-zinc-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-[10px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                  <Trophy size={13} className="text-yellow-500" />
                  Regras de Ranking e Vagas da Turma
                </h3>
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  Aplicado automaticamente a todos os simulados desta turma. O Ranking Geral permanece sempre ativo.
                </p>
              </div>
              {(totalVacanciesPreview.immediate > 0 || totalVacanciesPreview.reserve > 0) && (
                <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider shrink-0">
                  <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
                    {totalVacanciesPreview.immediate} Imed.
                  </span>
                  <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/25">
                    {totalVacanciesPreview.reserve} CR
                  </span>
                </div>
              )}
            </div>

            {/* Seletor de Modalidade */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => handleRankingModeChange('general')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  rankingConfig.mode === 'general'
                    ? 'bg-brand-red/10 border-brand-red/50 text-white'
                    : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Trophy size={13} className={rankingConfig.mode === 'general' ? 'text-brand-red' : 'text-zinc-500'} />
                  <span className="text-[10px] font-black uppercase tracking-wider">Ranking Geral</span>
                </div>
                <p className="text-[9px] text-zinc-500 leading-tight">Classificação única para todos os alunos.</p>
              </button>

              <button
                type="button"
                onClick={() => handleRankingModeChange('gender')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  rankingConfig.mode === 'gender'
                    ? 'bg-purple-500/10 border-purple-500/50 text-white'
                    : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Users size={13} className={rankingConfig.mode === 'gender' ? 'text-purple-400' : 'text-zinc-500'} />
                  <span className="text-[10px] font-black uppercase tracking-wider">Por Gênero</span>
                </div>
                <p className="text-[9px] text-zinc-500 leading-tight">Masculino e Feminino + Ranking Geral.</p>
              </button>

              <button
                type="button"
                onClick={() => handleRankingModeChange('regional')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  rankingConfig.mode === 'regional'
                    ? 'bg-blue-500/10 border-blue-500/50 text-white'
                    : 'bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <MapPin size={13} className={rankingConfig.mode === 'regional' ? 'text-blue-400' : 'text-zinc-500'} />
                  <span className="text-[10px] font-black uppercase tracking-wider">Regional</span>
                </div>
                <p className="text-[9px] text-zinc-500 leading-tight">Regiões cadastradas + Ranking Geral.</p>
              </button>
            </div>

            {/* Configuração: RANKING GERAL */}
            {rankingConfig.mode === 'general' && (
              <div className="grid grid-cols-2 gap-3 bg-zinc-950/70 p-3.5 rounded-xl border border-zinc-800/80">
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-emerald-400 uppercase tracking-wider">
                    Vagas Imediatas
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={rankingConfig.general?.immediate ?? 0}
                    onChange={(e) =>
                      setRankingConfig((prev) => ({
                        ...prev,
                        general: {
                          immediate: Math.max(0, Number(e.target.value) || 0),
                          reserve: prev.general?.reserve ?? 0
                        }
                      }))
                    }
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black text-amber-400 uppercase tracking-wider">
                    Cadastro Reserva (CR)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={rankingConfig.general?.reserve ?? 0}
                    onChange={(e) =>
                      setRankingConfig((prev) => ({
                        ...prev,
                        general: {
                          immediate: prev.general?.immediate ?? 0,
                          reserve: Math.max(0, Number(e.target.value) || 0)
                        }
                      }))
                    }
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
            )}

            {/* Configuração: RANKING POR GÊNERO */}
            {rankingConfig.mode === 'gender' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Masculino */}
                <div className="bg-zinc-950/70 p-3.5 rounded-xl border border-zinc-800/80 space-y-2.5">
                  <span className="block text-[10px] font-black text-blue-400 uppercase tracking-widest">
                    Masculino
                  </span>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-zinc-400 uppercase">Imediatas</label>
                      <input
                        type="number"
                        min={0}
                        value={rankingConfig.gender?.male.immediate ?? 0}
                        onChange={(e) =>
                          setRankingConfig((prev) => ({
                            ...prev,
                            gender: {
                              male: {
                                immediate: Math.max(0, Number(e.target.value) || 0),
                                reserve: prev.gender?.male.reserve ?? 0
                              },
                              female: prev.gender?.female || { immediate: 0, reserve: 0 }
                            }
                          }))
                        }
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-zinc-400 uppercase">Cad. Reserva</label>
                      <input
                        type="number"
                        min={0}
                        value={rankingConfig.gender?.male.reserve ?? 0}
                        onChange={(e) =>
                          setRankingConfig((prev) => ({
                            ...prev,
                            gender: {
                              male: {
                                immediate: prev.gender?.male.immediate ?? 0,
                                reserve: Math.max(0, Number(e.target.value) || 0)
                              },
                              female: prev.gender?.female || { immediate: 0, reserve: 0 }
                            }
                          }))
                        }
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Feminino */}
                <div className="bg-zinc-950/70 p-3.5 rounded-xl border border-zinc-800/80 space-y-2.5">
                  <span className="block text-[10px] font-black text-pink-400 uppercase tracking-widest">
                    Feminino
                  </span>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-zinc-400 uppercase">Imediatas</label>
                      <input
                        type="number"
                        min={0}
                        value={rankingConfig.gender?.female.immediate ?? 0}
                        onChange={(e) =>
                          setRankingConfig((prev) => ({
                            ...prev,
                            gender: {
                              male: prev.gender?.male || { immediate: 0, reserve: 0 },
                              female: {
                                immediate: Math.max(0, Number(e.target.value) || 0),
                                reserve: prev.gender?.female.reserve ?? 0
                              }
                            }
                          }))
                        }
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-pink-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-zinc-400 uppercase">Cad. Reserva</label>
                      <input
                        type="number"
                        min={0}
                        value={rankingConfig.gender?.female.reserve ?? 0}
                        onChange={(e) =>
                          setRankingConfig((prev) => ({
                            ...prev,
                            gender: {
                              male: prev.gender?.male || { immediate: 0, reserve: 0 },
                              female: {
                                immediate: prev.gender?.female.immediate ?? 0,
                                reserve: Math.max(0, Number(e.target.value) || 0)
                              }
                            }
                          }))
                        }
                        className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Configuração: RANKING REGIONAL */}
            {rankingConfig.mode === 'regional' && (
              <div className="space-y-3 bg-zinc-950/70 p-3.5 rounded-xl border border-zinc-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">
                    Regiões e Vagas
                  </span>
                  <button
                    type="button"
                    onClick={handleAddRegion}
                    className="flex items-center gap-1 text-[10px] font-black text-blue-400 hover:text-blue-300 uppercase tracking-wider px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/25 transition-colors"
                  >
                    <Plus size={11} /> Adicionar Região
                  </button>
                </div>

                <div className="space-y-2">
                  {(rankingConfig.regions || []).map((region, idx) => (
                    <div
                      key={region.id}
                      className="grid grid-cols-12 gap-2 items-end bg-zinc-900/50 p-2.5 rounded-lg border border-zinc-800/70"
                    >
                      <div className="col-span-12 sm:col-span-6 space-y-1">
                        <label className="text-[8px] font-bold text-zinc-500 uppercase">
                          Nome da Região {idx + 1}
                        </label>
                        <input
                          type="text"
                          value={region.name}
                          onChange={(e) => handleRegionChange(region.id, 'name', e.target.value)}
                          placeholder="EX: REGIONAL RIO BRANCO"
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2.5 py-1.5 text-xs text-white uppercase font-bold focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div className="col-span-5 sm:col-span-2 space-y-1">
                        <label className="text-[8px] font-bold text-emerald-400 uppercase">Imediatas</label>
                        <input
                          type="number"
                          min={0}
                          value={region.immediate}
                          onChange={(e) => handleRegionChange(region.id, 'immediate', e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-white text-center font-mono focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="col-span-5 sm:col-span-3 space-y-1">
                        <label className="text-[8px] font-bold text-amber-400 uppercase">Cad. Reserva</label>
                        <input
                          type="number"
                          min={0}
                          value={region.reserve}
                          onChange={(e) => handleRegionChange(region.id, 'reserve', e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded px-2 py-1.5 text-xs text-white text-center font-mono focus:outline-none focus:border-amber-500"
                        />
                      </div>
                      <div className="col-span-2 sm:col-span-1 flex justify-end pb-0.5">
                        <button
                          type="button"
                          onClick={() => handleRemoveRegion(region.id)}
                          className="p-1.5 text-zinc-600 hover:text-red-500 hover:bg-red-500/10 rounded transition-colors"
                          title="Remover região"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}

                  {(rankingConfig.regions || []).length === 0 && (
                    <div className="text-center py-4 text-[10px] font-bold uppercase text-zinc-600 border border-dashed border-zinc-800 rounded-lg">
                      Nenhuma região cadastrada. Clique em &ldquo;Adicionar Região&rdquo;.
                    </div>
                  )}
                </div>
              </div>
            )}

            {rankingError && (
              <p className="text-[10px] font-bold text-red-400 uppercase tracking-wide">{rankingError}</p>
            )}
          </div>

          {/* SEGURANÇA E FREE PASS */}
          <div className="bg-[#1a1d24] p-4 rounded-xl border border-zinc-800 space-y-4">
            <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Segurança, Rascunho e Passe Livre (Free Pass)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Status de Publicação</label>
                <select
                  value={formData.isBlocked ? 'blocked' : (formData.published !== false ? 'published' : 'draft')}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === 'blocked') {
                      setFormData(prev => ({...prev, published: true, isBlocked: true}));
                    } else if (val === 'published') {
                      setFormData(prev => ({...prev, published: true, isBlocked: false}));
                    } else {
                      setFormData(prev => ({...prev, published: false, isBlocked: false}));
                    }
                  }}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-white focus:border-brand-red outline-none uppercase font-bold cursor-pointer"
                >
                  <option value="published">PUBLICADO (Visível para alunos)</option>
                  <option value="draft">RASCUNHO (Oculto / Teste)</option>
                  <option value="blocked">BLOQUEADO (Em produção - Exibe cadeado)</option>
                </select>
              </div>

              {formData.isBlocked && (
                <div className="col-span-full mt-2">
                  <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Data de Liberação / Desbloqueio (Opcional)</label>
                  <input
                    type="date"
                    value={formData.unlockDate || ''}
                    onChange={e => setFormData(prev => ({...prev, unlockDate: e.target.value}))}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-white focus:border-brand-red outline-none"
                  />
                  <p className="text-[9px] text-zinc-500 mt-1">Data exibida junto ao card bloqueado para informar os alunos quando será liberado.</p>
                </div>
              )}

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!formData.excludeFromFreePass}
                    onChange={e => setFormData(prev => ({...prev, excludeFromFreePass: e.target.checked}))}
                    className="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-brand-red focus:ring-brand-red"
                  />
                  <span className="text-[10px] font-bold text-white uppercase tracking-wider">Excluir do Free Pass (Passe Livre)</span>
                </label>
              </div>

              <div className="col-span-full">
                <label className="block text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-1">Lista Branca de E-mails para Rascunho (Whitelist)</label>
                <input
                  type="text"
                  value={Array.isArray(formData.draftWhitelist) ? formData.draftWhitelist.join(', ') : ''}
                  onChange={e => setFormData(prev => ({...prev, draftWhitelist: e.target.value.split(',').map(s => s.trim()).filter(Boolean)}))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-white focus:border-brand-red outline-none font-medium"
                  placeholder="email1@teste.com, email2@teste.com"
                />
                <p className="text-[9px] text-zinc-500 mt-1">E-mails separados por vírgula que poderão visualizar esta turma mesmo estando em modo Rascunho.</p>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-brand-red hover:bg-red-600 text-white font-black py-4 rounded-xl transition-all uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-red-900/20"
            >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> 
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Save size={16} /> Salvar Turma
                  </>
                )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SimulatedClassForm;