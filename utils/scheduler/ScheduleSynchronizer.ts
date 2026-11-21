import { ClassScheduleEvent } from '../../types/schedule';
import { Topic, Module } from '../../types/curriculum';

export const sanitizeSchedule = (
  events: ClassScheduleEvent[], 
  activeTopics: Topic[], 
  activeModules: Module[]
): ClassScheduleEvent[] => {
  // Cria conjuntos (Sets) com os IDs ativos para busca rápida (O(1))
  const activeTopicIds = new Set(activeTopics.map(t => t.id));
  const activeModuleIds = new Set(
    activeModules
      .filter(m => !m.isOnline && !m.isGuidedStudy)
      .map(m => m.id)
  );

  // Retorna apenas os eventos que pertencem a tópicos e módulos que AINDA existem
  return events.filter(event => {
    // Eventos de simulado são independentes dos tópicos/módulos de disciplinas
    if (event.eventType === 'SIMULADO') return true;
    // Aulas extras/revisões livres não consomem nem dependem de módulos específicos
    if (event.allocationMode === 'FREE_REVIEW' || event.topicId === 'free_review') return true;
    // Se o evento não for uma aula padrão (ex: feriado, lacuna), mantenha-o.
    if (!event.topicId || !event.moduleId) return true; 

    const topicExists = activeTopicIds.has(event.topicId);
    const moduleExists = activeModuleIds.has(event.moduleId);
    const anyLinkedExists = Boolean(
      event.linkedModules?.some(
        lm => activeTopicIds.has(lm.topicId) && activeModuleIds.has(lm.moduleId)
      )
    );

    return (topicExists && moduleExists) || anyLinkedExists;
  });
};
