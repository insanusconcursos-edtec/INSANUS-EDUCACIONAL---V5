import React from 'react';
import { CourseModuleGroup } from '../../../../types/course';
import { Layers, Lock, Edit2, Trash2, ChevronLeft, ChevronRight, FolderOpen } from 'lucide-react';

interface CourseModuleGroupCardProps {
  group: CourseModuleGroup;
  moduleCount: number;
  onEdit: (group: CourseModuleGroup) => void;
  onDelete: (group: CourseModuleGroup) => void;
  onMoveLeft: (group: CourseModuleGroup) => void;
  onMoveRight: (group: CourseModuleGroup) => void;
  onOpen: (group: CourseModuleGroup) => void;
  isFirst: boolean;
  isLast: boolean;
}

export const CourseModuleGroupCard: React.FC<CourseModuleGroupCardProps> = ({
  group,
  moduleCount,
  onEdit,
  onDelete,
  onMoveLeft,
  onMoveRight,
  onOpen,
  isFirst,
  isLast
}) => {
  const formattedDate = group.releaseDate 
    ? new Date(group.releaseDate + 'T00:00:00').toLocaleDateString('pt-BR') 
    : '';

  return (
    <div className="flex-none w-60 group relative flex flex-col">
      {/* Container da Capa Vertical (Estilo Netflix) */}
      <div 
        onClick={() => onOpen(group)}
        className="relative aspect-[474/1000] bg-[#121418] rounded-xl overflow-hidden border-2 border-purple-900/60 hover:border-purple-500 transition-all duration-300 cursor-pointer shadow-lg shadow-purple-950/20"
      >
        <img 
          src={group.coverUrl} 
          alt={group.title} 
          className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${group.isLocked ? 'grayscale opacity-50' : ''}`}
        />

        {/* Tag Indicadora de Bloco / Grupo no topo */}
        <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
          <span className="bg-purple-600/90 backdrop-blur-md text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md shadow-md flex items-center gap-1.5 border border-purple-400/30">
            <Layers size={11} /> BLOCO
          </span>
          <span className="bg-black/75 backdrop-blur-md text-zinc-300 text-[10px] font-bold px-2 py-1 rounded-md border border-white/10">
            {moduleCount} {moduleCount === 1 ? 'módulo' : 'módulos'}
          </span>
        </div>

        {/* Overlay de Bloqueio */}
        {group.isLocked && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 p-4 text-center z-20">
            <div className="bg-red-600 p-2.5 rounded-full mb-2 shadow-lg">
              <Lock size={16} className="text-white" />
            </div>
            <span className="text-white font-bold text-xs uppercase tracking-wider mb-1">Bloco Bloqueado</span>
            {group.releaseDate && (
              <p className="text-[10px] text-gray-300">Libera em: {formattedDate}</p>
            )}
          </div>
        )}

        {/* Overlay Hover com Ação Principal */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4 z-20">
          <span className="text-[10px] uppercase font-bold text-purple-400 tracking-wider mb-1">Bloco de Módulos</span>
          <h3 className="text-white font-black text-sm mb-3 line-clamp-2 drop-shadow-md">{group.title}</h3>
          
          <button 
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(group);
            }}
            className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold uppercase rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-purple-900/40 transition-colors"
          >
            <FolderOpen size={14} />
            Ver Módulos ({moduleCount})
          </button>
        </div>
      </div>

      {/* Barra de Ações Inferior */}
      <div className="mt-2 grid grid-cols-4 gap-1 bg-[#121418] p-1 rounded-lg border border-purple-900/40">
        <button 
          onClick={() => onMoveLeft(group)} 
          disabled={isFirst} 
          className="p-1.5 text-gray-400 hover:text-white hover:bg-zinc-800 rounded disabled:opacity-20 flex justify-center transition-colors" 
          title="Mover bloco para esquerda"
        >
          <ChevronLeft size={16} />
        </button>
        
        <button 
          onClick={() => onEdit(group)} 
          className="p-1.5 text-gray-400 hover:text-purple-400 hover:bg-zinc-800 rounded flex justify-center transition-colors" 
          title="Editar bloco"
        >
          <Edit2 size={16} />
        </button>

        <button 
          onClick={() => onDelete(group)} 
          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-zinc-800 rounded flex justify-center transition-colors" 
          title="Excluir bloco (os módulos voltam para a raiz)"
        >
          <Trash2 size={16} />
        </button>

        <button 
          onClick={() => onMoveRight(group)} 
          disabled={isLast} 
          className="p-1.5 text-gray-400 hover:text-white hover:bg-zinc-800 rounded disabled:opacity-20 flex justify-center transition-colors" 
          title="Mover bloco para direita"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};
