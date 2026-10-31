import React from 'react';
import { Lock } from 'lucide-react';
import toast from 'react-hot-toast';

interface StudentCourseCardProps {
  course: any; // Mantendo any por flexibilidade com estrutura de produto do Ticto
  onClick?: (course: any) => void;
  isLocked?: boolean;
  isMaintenance?: boolean;
  price?: number;
}

export const StudentCourseCard: React.FC<StudentCourseCardProps> = ({ course, onClick, isLocked, isMaintenance, price }) => {
  const isScholarship = course.isScholarship;
  const maintenanceMode = course.maintenanceMode;
  const isBlockedByAdmin = course.isBlocked === true;
  const effectiveLocked = isLocked || isBlockedByAdmin;

  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    
    // 1. Improved date parsing (extremely robust)
    const d = ensureDate(date);
    
    if (!d || isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString('pt-BR');
  };

  const ensureDate = (val: any): Date | null => {
    if (!val) return null;

    // A. If already a Date
    if (val instanceof Date) return val;

    // B. If it's a Firestore Timestamp (Client or Admin SDK)
    if (typeof val.toDate === 'function') return val.toDate();
    
    // C. Object with seconds (Admin SDK / JSON)
    if (typeof val === 'object' && (val.seconds !== undefined || val._seconds !== undefined)) {
      const s = val.seconds ?? val._seconds;
      const n = val.nanoseconds ?? val._nanoseconds ?? 0;
      return new Date(s * 1000 + n / 1000000);
    }

    // D. String (ISO or other)
    if (typeof val === 'string' && val.trim() !== '') {
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    }

    return null;
  };

  return (
    <div 
      onClick={() => {
        if (isBlockedByAdmin) {
          const dateStr = course.unlockDate ? course.unlockDate.split('-').reverse().join('/') : null;
          toast.error(dateStr ? `Este curso está bloqueado pelo administrador. Liberação prevista para ${dateStr}.` : 'Este curso está bloqueado pelo administrador.');
          return;
        }
        if (onClick) onClick(course);
      }}
      className={`group relative aspect-[474/1000] rounded-xl overflow-hidden cursor-pointer border shadow-lg transition-all duration-300 hover:shadow-2xl ${
        effectiveLocked 
          ? 'border-zinc-800 hover:border-red-600/50' 
          : 'border-gray-800 hover:shadow-red-900/20 hover:border-red-600/30'
      }`}
    >
      {/* --- BADGE BOLSISTA --- */}
      {isScholarship && (
        <div className="absolute top-2 left-2 z-10">
          <span className="bg-blue-900/80 backdrop-blur-sm text-blue-400 border border-blue-800 text-[10px] font-black px-2 py-0.5 rounded shadow-lg uppercase tracking-widest">
            Bolsista
          </span>
        </div>
      )}

      {/* --- CADEADO (Para Cursos Bloqueados pelo Admin, Trancados ou Manutenção) --- */}
      {(effectiveLocked || isMaintenance) && (
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 items-end">
          <div className={`backdrop-blur-md border p-1.5 rounded shadow-lg ${isMaintenance ? 'bg-orange-500/80 text-white border-orange-400/50' : 'bg-black/80 text-zinc-300 border-zinc-700/50'}`}>
            {isMaintenance ? (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            ) : (
                <Lock size={12} />
            )}
          </div>
          {isBlockedByAdmin && (
            <div className="bg-black/90 border border-zinc-700 text-zinc-300 text-[9px] font-black px-2 py-0.5 rounded shadow-lg uppercase tracking-widest">
              Bloqueado
            </div>
          )}
          {isBlockedByAdmin && course.unlockDate && (
            <div className="bg-red-600 text-white text-[8px] font-black px-2 py-0.5 rounded shadow-lg uppercase tracking-widest">
              Libera: {course.unlockDate.split('-').reverse().join('/')}
            </div>
          )}
          {isMaintenance && (
            <div className="bg-orange-600 text-white text-[8px] font-black px-2 py-0.5 rounded shadow-lg uppercase tracking-widest">
              Manutenção
            </div>
          )}
          {isLocked && !isBlockedByAdmin && price !== undefined && (
            <div className="bg-red-600 text-white text-[9px] font-black px-2 py-1 rounded shadow-lg uppercase tracking-tighter">
              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)}
            </div>
          )}
        </div>
      )}

      {/* --- IMAGEM DA CAPA (Fundo Total - Preto e Branco se bloqueado) --- */}
      <img 
        src={course.coverUrl} 
        alt={course.title || course.name} 
        className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${(effectiveLocked || isMaintenance) ? 'grayscale opacity-60' : ''}`}
        loading="lazy"
      />

      {/* --- DATAS DE ACESSO (Se liberado) --- */}
      {!effectiveLocked && !isMaintenance && (course.startDate || course.endDate) && (
        <div className="absolute top-2 right-2 z-10 flex flex-col gap-1 items-end">
          <div className="bg-black/70 backdrop-blur-md border border-white/10 p-2 rounded-lg flex flex-col gap-1 items-end shadow-2xl">
              <div className="flex items-center gap-1.5 text-[8px] font-black uppercase tracking-widest text-zinc-400">
                <div className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></div>
                Acesso Ativo
              </div>
              <div className="flex flex-col items-end opacity-80">
                <span className="text-[7px] font-bold text-zinc-500 uppercase">Expira em:</span>
                <span className="text-[9px] font-black text-white">{formatDate(course.endDate)}</span>
              </div>
          </div>
        </div>
      )}

      {/* --- OVERLAY DE INTERAÇÃO (Aparece no Hover) --- */}
      <div className={`absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center backdrop-blur-[2px] ${(effectiveLocked || isMaintenance) ? 'bg-black/60' : ''}`}>
        
        {isBlockedByAdmin ? (
            <div className="flex flex-col items-center gap-3 px-6 text-center">
               <div className="bg-zinc-800 text-zinc-400 rounded-full p-4 shadow-lg border border-zinc-700">
                   <Lock size={24} />
               </div>
               <p className="text-white text-[10px] font-bold uppercase tracking-widest leading-tight">
                   Curso Bloqueado pelo Administrador
               </p>
               {course.unlockDate && (
                   <p className="text-red-400 text-[9px] font-black uppercase tracking-widest">
                       Liberação: {course.unlockDate.split('-').reverse().join('/')}
                   </p>
               )}
            </div>
        ) : isMaintenance ? (
            <div className="flex flex-col items-center gap-3 px-6 text-center">
               <div className="bg-orange-600 text-white rounded-full p-4 shadow-lg shadow-orange-900/40">
                   <Lock size={24} />
               </div>
               <p className="text-white text-[10px] font-bold uppercase tracking-widest leading-tight">
                   Curso em Manutenção
               </p>
               {maintenanceMode?.endDate && (
                   <p className="text-orange-400 text-[8px] font-bold uppercase tracking-tighter">
                       Até: {new Date(maintenanceMode.endDate + 'T12:00:00').toLocaleDateString('pt-BR')}
                   </p>
               )}
            </div>
        ) : isLocked ? (
           <div className="flex flex-col items-center gap-3">
              <div className="bg-white text-black rounded-full p-4 shadow-lg transform scale-50 group-hover:scale-100 transition-all duration-300 ease-out font-black text-xs uppercase tracking-widest">
                 Comprar
              </div>
              <p className="text-white text-[10px] font-bold uppercase tracking-widest px-4 text-center">Acesso Imediato</p>
           </div>
        ) : (
          <div className="bg-red-600 text-white rounded-full p-4 shadow-lg shadow-red-600/40 transform scale-50 group-hover:scale-100 transition-all duration-300 ease-out">
              <svg className="w-8 h-8 ml-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
              </svg>
          </div>
        )}

      </div>

      {/* Gradiente sutil na base */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black via-black/40 to-transparent opacity-90 pointer-events-none" />
      
      {/* Título e Datas na base */}
      <div className="absolute bottom-4 left-4 right-4 z-10 space-y-2">
        <div className="flex items-center gap-2">
          {course.organization && (
            <span className="text-[9px] font-black text-red-500 uppercase tracking-widest bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20">
              {course.organization}
            </span>
          )}
          {course.categoryName && (
            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700">
              {course.categoryName}
            </span>
          )}
        </div>

        <h3 className="text-white text-sm font-black uppercase tracking-tight line-clamp-2 leading-tight drop-shadow-md">
          {course.title || course.name}
        </h3>
      </div>
    </div>
  );
};
