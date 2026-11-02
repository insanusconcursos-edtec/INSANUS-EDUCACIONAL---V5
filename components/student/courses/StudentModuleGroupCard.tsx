import React from 'react';
import { CourseModuleGroup } from '../../../types/course';
import { Layers, Lock } from 'lucide-react';

interface StudentModuleGroupCardProps {
  group: CourseModuleGroup;
  moduleCount: number;
  onClick: (group: CourseModuleGroup) => void;
  isMaintenanceLocked?: boolean;
}

export const StudentModuleGroupCard: React.FC<StudentModuleGroupCardProps> = ({
  group,
  moduleCount,
  onClick,
  isMaintenanceLocked
}) => {
  // Lógica de Bloqueio (Data ou Manual ou Manutenção)
  const isDateLocked = group.releaseDate 
    ? new Date(group.releaseDate + "T00:00:00") > new Date() 
    : false;
    
  const isLocked = isMaintenanceLocked || !!group.isLocked || isDateLocked;

  const formattedDate = group.releaseDate 
    ? new Date(group.releaseDate + 'T00:00:00').toLocaleDateString('pt-BR') 
    : '';

  const handleClick = () => {
    if (!isLocked) {
      onClick(group);
    }
  };

  return (
    <div 
      onClick={handleClick}
      className={`relative w-40 sm:w-48 md:w-56 lg:w-64 shrink-0 aspect-[474/1000] rounded-xl overflow-hidden transition-all duration-300 group border-2
        ${isLocked 
          ? 'border-gray-800 cursor-not-allowed opacity-70 grayscale' 
          : 'border-purple-900/50 hover:border-purple-500 cursor-pointer hover:scale-105 hover:z-10 hover:shadow-2xl hover:shadow-purple-950/50'
        }
      `}
    >
      <img 
        src={group.coverUrl} 
        alt={group.title} 
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
        referrerPolicy="no-referrer"
      />

      {/* Badges de Identificação do Bloco no Topo */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
        <span className="bg-purple-600/90 backdrop-blur-md text-white text-[9px] md:text-[10px] font-black uppercase tracking-wider px-2 py-0.5 md:py-1 rounded-md shadow-md flex items-center gap-1 border border-purple-400/30">
          <Layers size={10} /> BLOCO
        </span>
        <span className="bg-black/80 backdrop-blur-md text-zinc-200 text-[9px] md:text-[10px] font-bold px-2 py-0.5 md:py-1 rounded-md border border-white/10">
          {moduleCount} {moduleCount === 1 ? 'módulo' : 'módulos'}
        </span>
      </div>

      {/* Gradiente Inferior com Título do Bloco */}
      <div className="absolute inset-x-0 bottom-0 p-3 pt-12 bg-gradient-to-t from-black via-black/60 to-transparent flex flex-col justify-end">
        <span className="text-[9px] uppercase font-bold text-purple-400 tracking-wider">Acessar Bloco</span>
        <h4 className="text-white font-black text-xs md:text-sm line-clamp-2 drop-shadow-md uppercase">
          {group.title}
        </h4>
      </div>

      {/* Overlay de Bloqueio */}
      {isLocked && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 p-4 text-center backdrop-blur-[2px] z-20">
          <div className="bg-gray-800 p-3 rounded-full mb-2 border border-gray-700 shadow-lg">
            <Lock size={20} className="text-red-500" />
          </div>
          <span className="text-gray-200 font-black text-xs uppercase tracking-wider mb-1">Bloco Bloqueado</span>
          {group.releaseDate && (
            <div className="bg-black/80 px-2 py-1 rounded text-[10px] text-gray-400 mt-2 border border-gray-700">
              Disponível em: <br/><span className="text-white font-mono">{formattedDate}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
