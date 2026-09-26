import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Upload, Image as ImageIcon, Loader2, Link as LinkIcon, GraduationCap, Headphones } from 'lucide-react';
import { Plan, Category, createPlan, updatePlan, uploadPlanImage } from '../../services/planService';
import { getSimulatedClasses, SimulatedClass } from '../../services/simulatedService';
import { subscribeToMentors } from '../../services/mentorService';
import { Mentor } from '../../types/chat';
import { courseService } from '../../services/courseService';
import { OnlineCourse } from '../../types/course';

interface PlanFormProps {
  isOpen: boolean;
  onClose: () => void;
  planToEdit?: Plan | null;
  categories: Category[];
  refreshData: () => void;
}

const PlanForm: React.FC<PlanFormProps> = ({ isOpen, onClose, planToEdit, categories, refreshData }) => {
  const [formData, setFormData] = useState({
    title: '',
    imageUrl: '', // Mantém a URL final
    category: '',
    subcategory: '',
    organ: '',
    purchaseLink: '',
    linkedSimuladoClassId: '', // NOVO: Campo de vínculo
    linkedMentors: [] as string[],
    linkedCourses: [] as { courseId: string; tabName: string; visibleTabs: string[] }[],
    isGenerationBlocked: false,
    isChatDisabled: false
  });
  
  // Estado para lidar com upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado para as turmas de simulados e mentores
  const [simClasses, setSimClasses] = useState<SimulatedClass[]>([]);
  const [availableMentors, setAvailableMentors] = useState<Mentor[]>([]);
  const [availableCourses, setAvailableCourses] = useState<OnlineCourse[]>([]);

  useEffect(() => {
    // Busca turmas, mentores e cursos disponíveis ao abrir
    let unsubscribeMentors: () => void;

    if (isOpen) {
        getSimulatedClasses().then(setSimClasses).catch(console.error);
        unsubscribeMentors = subscribeToMentors(setAvailableMentors);
        courseService.getCourses().then(setAvailableCourses).catch(console.error);
    }

    if (planToEdit) {
      setFormData({
        title: planToEdit.title,
        imageUrl: planToEdit.imageUrl,
        category: planToEdit.category,
        subcategory: planToEdit.subcategory,
        organ: planToEdit.organ,
        purchaseLink: planToEdit.purchaseLink,
        linkedSimuladoClassId: planToEdit.linkedSimuladoClassId || '',
        linkedMentors: planToEdit.linkedMentors || [],
        linkedCourses: planToEdit.linkedCourses || [],
        isGenerationBlocked: planToEdit.isGenerationBlocked || false,
        isChatDisabled: planToEdit.isChatDisabled || false
      });
      setPreviewUrl(planToEdit.imageUrl);
      setSelectedFile(null);
    } else {
      setFormData({
        title: '',
        imageUrl: '',
        category: '',
        subcategory: '',
        organ: '',
        purchaseLink: '',
        linkedSimuladoClassId: '',
        linkedMentors: [],
        linkedCourses: [],
        isGenerationBlocked: false,
        isChatDisabled: false
      });
      setPreviewUrl('');
      setSelectedFile(null);
    }

    return () => {
      if (unsubscribeMentors) unsubscribeMentors();
    };
  }, [planToEdit, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target as any;
    if (type === 'checkbox') {
        const checked = (e.target as HTMLInputElement).checked;
        setFormData(prev => ({ ...prev, [name]: checked }));
    } else {
        setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const toggleMentor = (mentorId: string) => {
    setFormData(prev => {
      const current = prev.linkedMentors || [];
      const updated = current.includes(mentorId)
        ? current.filter(id => id !== mentorId)
        : [...current, mentorId];
      return { ...prev, linkedMentors: updated };
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      
      // Cria URL temporária para preview imediato
      const objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      let finalImageUrl = formData.imageUrl;

      // Se houver um novo arquivo selecionado, faz o upload primeiro
      if (selectedFile) {
        finalImageUrl = await uploadPlanImage(selectedFile);
      }

      const planData = {
        ...formData,
        imageUrl: finalImageUrl
      };

      if (planToEdit && planToEdit.id) {
        await updatePlan(planToEdit.id, planData);
      } else {
        await createPlan(planData);
      }
      
      refreshData();
      onClose();
    } catch (error) {
      console.error("Error saving plan:", error);
      alert("Erro ao salvar plano. Verifique o console.");
    } finally {
      setLoading(false);
    }
  };

  // Get subcategories for selected category
  const activeCategory = categories.find(c => c.name === formData.category);
  const subcategories = activeCategory ? activeCategory.subcategories : [];

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative w-full max-w-lg bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-zinc-900 flex items-center justify-between bg-zinc-900/50">
          <h2 className="text-xl font-black text-white uppercase tracking-tighter">
            {planToEdit ? 'Editar Plano' : 'Novo Plano de Estudo'}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
          {/* Image Upload Section */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Imagem de Capa</label>
            
            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/*"
              className="hidden"
            />

            <div 
              onClick={triggerFileInput}
              className={`group relative w-full h-48 border-2 border-dashed rounded-xl overflow-hidden cursor-pointer transition-all ${
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
                  <span className="text-[10px] font-black uppercase tracking-widest">Clique para selecionar imagem</span>
                </div>
              )}
            </div>
            {selectedFile && (
               <p className="text-[10px] text-green-500 font-mono mt-1">
                 Arquivo selecionado: {selectedFile.name}
               </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Título do Plano</label>
            <input 
                name="title"
                value={formData.title}
                onChange={handleChange}
                placeholder="EX: POLÍCIA CIVIL DO ACRE"
                required
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-brand-red uppercase font-bold"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Categoria</label>
                <select 
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    required
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-xs text-white focus:outline-none focus:border-brand-red uppercase"
                >
                    <option value="">Selecione</option>
                    {categories.map(cat => (
                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                    ))}
                </select>
            </div>
            <div className="space-y-2">
                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Subcategoria</label>
                <select 
                    name="subcategory"
                    value={formData.subcategory}
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
                name="organ"
                value={formData.organ}
                onChange={handleChange}
                placeholder="EX: PC-AC"
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-brand-red uppercase font-bold"
            />
          </div>

          {/* --- VINCULAÇÃO DE TURMA DE SIMULADOS (Tópico 4.10.2) --- */}
          <div className="bg-[#1a1d24] p-6 rounded-2xl border border-gray-800 mb-6 mt-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-yellow-500/10 rounded-lg text-yellow-500">
                        <GraduationCap size={20} />
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-sm uppercase tracking-wider">Vinculação de Simulados</h3>
                        <p className="text-gray-500 text-[10px] mt-0.5">Selecione uma turma de simulados para disponibilizar provas neste plano.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    <label className="block">
                        <span className="text-gray-500 text-[10px] font-black mb-2 block uppercase tracking-widest">Turma de Simulados Associada</span>
                        <select
                            name="linkedSimuladoClassId"
                            value={formData.linkedSimuladoClassId || ''}
                            onChange={handleChange}
                            className="w-full bg-zinc-900 border border-gray-700 text-white text-xs font-bold rounded-lg p-3 focus:border-yellow-500 outline-none transition-colors uppercase"
                        >
                            <option value="">-- Nenhuma Turma Vinculada --</option>
                            {simClasses.map((simClass) => (
                                <option key={simClass.id} value={simClass.id}>
                                    {simClass.title} ({simClass.organization})
                                </option>
                            ))}
                        </select>
                    </label>
                    
                    {formData.linkedSimuladoClassId && (
                        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg flex items-center gap-2">
                            <LinkIcon size={14} className="text-yellow-500" />
                            <span className="text-[10px] font-bold text-yellow-200 uppercase tracking-wide">
                                Ao salvar, os usuários deste plano ganharão acesso automático a esta turma de simulados.
                            </span>
                        </div>
                    )}
                </div>
          </div>

          {/* --- VINCULAÇÃO DE MENTORES --- */}
          <div className="bg-[#1a1d24] p-6 rounded-2xl border border-gray-800 mb-6 mt-6">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                        <Headphones size={20} />
                    </div>
                    <div>
                        <h3 className="text-white font-bold text-sm uppercase tracking-wider">Mentores Vinculados</h3>
                        <p className="text-gray-500 text-[10px] mt-0.5">Selecione os mentores que atenderão os alunos deste plano.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {availableMentors.map((mentor) => (
                        <div 
                          key={mentor.id}
                          onClick={() => toggleMentor(mentor.id)}
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            formData.linkedMentors?.includes(mentor.id)
                              ? 'bg-blue-500/10 border-blue-500/50'
                              : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                          }`}
                        >
                          <div className="w-8 h-8 rounded-full overflow-hidden border border-zinc-800">
                            <img src={mentor.photoUrl} alt={mentor.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </div>
                          <span className={`text-[10px] font-bold uppercase tracking-tight ${
                            formData.linkedMentors?.includes(mentor.id) ? 'text-white' : 'text-zinc-500'
                          }`}>
                            {mentor.name}
                          </span>
                        </div>
                    ))}
                    {availableMentors.length === 0 && (
                      <p className="col-span-full text-[10px] text-zinc-600 italic">Nenhum mentor cadastrado.</p>
                    )}
                </div>
          </div>

          {/* --- VINCULAÇÃO DE CURSOS ONLINE --- */}
          <div className="bg-[#1a1d24] p-6 rounded-2xl border border-gray-800 mb-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                  <GraduationCap size={20} />
                </div>
                <div>
                  <h3 className="text-white font-bold text-sm uppercase tracking-wider">Cursos Online Vinculados</h3>
                  <p className="text-gray-500 text-[10px] mt-0.5">Vincule cursos online e configure as abas visíveis aos alunos deste plano.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setFormData(prev => ({
                    ...prev,
                    linkedCourses: [...(prev.linkedCourses || []), { courseId: '', tabName: '', visibleTabs: ['MODULES', 'EDITAL'] }]
                  }));
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[9px] font-black uppercase tracking-widest transition-colors flex items-center gap-1.5"
              >
                + Vincular Curso
              </button>
            </div>

            <div className="space-y-4">
              {(formData.linkedCourses || []).map((linkedCourse, index) => (
                <div key={index} className="p-4 bg-zinc-900/60 border border-zinc-800 rounded-xl space-y-3 relative">
                  <button
                    type="button"
                    onClick={() => {
                      setFormData(prev => ({
                        ...prev,
                        linkedCourses: (prev.linkedCourses || []).filter((_, i) => i !== index)
                      }));
                    }}
                    className="absolute top-3 right-3 text-zinc-500 hover:text-red-500 transition-colors"
                  >
                    <X size={14} />
                  </button>

                  {/* Seleção do Curso */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Curso Online</label>
                    <select
                      value={linkedCourse.courseId}
                      required
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData(prev => {
                          const updated = [...(prev.linkedCourses || [])];
                          updated[index] = { ...updated[index], courseId: val };
                          return { ...prev, linkedCourses: updated };
                        });
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 text-xs text-white rounded-lg p-2.5 focus:outline-none focus:border-brand-red uppercase font-bold"
                    >
                      <option value="">Selecione o Curso...</option>
                      {availableCourses.map(c => (
                        <option key={c.id} value={c.id}>{c.title.toUpperCase()}</option>
                      ))}
                    </select>
                  </div>

                  {/* Nome da Aba */}
                  <div className="space-y-1">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest">Nome da Aba (Aluno)</label>
                    <input
                      type="text"
                      value={linkedCourse.tabName}
                      required
                      placeholder="EX: BÔNUS - PC AC ONLINE"
                      onChange={(e) => {
                        const val = e.target.value;
                        setFormData(prev => {
                          const updated = [...(prev.linkedCourses || [])];
                          updated[index] = { ...updated[index], tabName: val };
                          return { ...prev, linkedCourses: updated };
                        });
                      }}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-brand-red uppercase font-bold"
                    />
                  </div>

                  {/* Abas Visíveis */}
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block">Abas Visíveis no Curso</label>
                    <div className="grid grid-cols-2 gap-2 bg-zinc-950 p-2.5 rounded-lg border border-zinc-800">
                      {[
                        { id: 'MODULES', label: 'Módulos' },
                        { id: 'EDITAL', label: 'Edital' },
                        { id: 'LIVE', label: 'Ao Vivo' },
                        { id: 'PRESENTIAL', label: 'Presencial' }
                      ].map(tab => {
                        const isChecked = linkedCourse.visibleTabs?.includes(tab.id);
                        return (
                          <label key={tab.id} className="flex items-center gap-2 cursor-pointer text-[10px] text-zinc-400 font-bold uppercase select-none">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setFormData(prev => {
                                  const updated = [...(prev.linkedCourses || [])];
                                  const currentTabs = updated[index].visibleTabs || [];
                                  const newTabs = currentTabs.includes(tab.id)
                                    ? currentTabs.filter(id => id !== tab.id)
                                    : [...currentTabs, tab.id];
                                  updated[index] = { ...updated[index], visibleTabs: newTabs };
                                  return { ...prev, linkedCourses: updated };
                                });
                              }}
                              className="w-3.5 h-3.5 rounded border-zinc-800 bg-zinc-950 text-emerald-600 focus:ring-emerald-600 focus:ring-opacity-25"
                            />
                            <span>{tab.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}

              {(formData.linkedCourses || []).length === 0 && (
                <p className="text-[10px] text-zinc-500 italic text-center">Nenhum curso online vinculado.</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Link de Venda / Página</label>
            <input 
                name="purchaseLink"
                value={formData.purchaseLink}
                onChange={handleChange}
                placeholder="https://..."
                className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3 text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-brand-red"
            />
          </div>

          {/* NOVO: BLOQUEIO DE GERAÇÃO */}
          <div className="bg-red-950/20 border border-red-900/30 p-4 rounded-xl flex items-center justify-between gap-4">
              <div className="flex-1">
                  <h4 className="text-[10px] font-black text-red-500 uppercase tracking-widest">Bloqueio de Cronograma</h4>
                  <p className="text-[10px] text-zinc-500 mt-1 leading-relaxed">
                      Se ativado, nenhum aluno poderá gerar novos cronogramas para este plano.
                  </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                      type="checkbox" 
                      name="isGenerationBlocked"
                      checked={formData.isGenerationBlocked}
                      onChange={handleChange}
                      className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-red"></div>
              </label>
          </div>

          {/* NOVO: DESABILITAR CHAT DO MENTOR */}
          <div className="bg-zinc-950 border border-zinc-800 p-4 rounded-xl flex items-center justify-between gap-4">
              <div className="flex-1">
                  <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Desabilitar Chat com Mentor</h4>
                  <p className="text-[10px] text-zinc-500 mt-1 leading-relaxed">
                      Se ativado, o chat com o mentor ficará temporariamente desabilitado e oculto para os alunos.
                  </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                      type="checkbox" 
                      name="isChatDisabled"
                      checked={formData.isChatDisabled}
                      onChange={handleChange}
                      className="sr-only peer" 
                  />
                  <div className="w-11 h-6 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-red"></div>
              </label>
          </div>

          <div className="pt-4">
            <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-brand-red hover:bg-red-600 text-white font-black py-4 rounded-xl transition-all uppercase tracking-widest flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> 
                    {selectedFile ? 'Enviando imagem...' : 'Salvando...'}
                  </>
                ) : (
                  <>
                    <Save size={16} /> Salvar Plano
                  </>
                )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PlanForm;