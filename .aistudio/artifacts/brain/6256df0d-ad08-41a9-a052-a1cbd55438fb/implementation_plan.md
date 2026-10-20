# Relatório de Planejamento: Estudo Guiado nas Turmas Presenciais

Este relatório apresenta a arquitetura, o modelo de dados e o fluxo de experiência para a implementação do **Estudo Guiado** nas **Turmas Presenciais**, garantindo 100% de compatibilidade e segurança com as funções já consolidadas na plataforma.

---

## Confirmadas pelo Usuário nas Clarificações

- **Gestão do Administrador**: O Estudo Guiado será gerenciado diretamente pelo cronograma/calendário de estudos da turma presencial. Quando a função estiver ativada na turma, o administrador poderá cadastrar Metas de Estudo nos dias da semana no mesmo calendário onde agenda as Aulas Presenciais.
- **Visualização do Aluno**: O aluno acessará o cronograma de estudos da sua turma presencial normalmente. Nos dias em que houver Estudo Guiado, verá tanto as aulas presenciais agendadas quanto as metas de estudo a serem cumpridas.
- **Organização de Metas**: As metas ficam vinculadas a datas específicas do calendário da turma presencial.

---

## 1. Visão Geral e Conceito

O **Estudo Guiado** é uma funcionalidade opcional (*Feature Flag*) habilitada por turma presencial. Quando ativado pelo administrador na configuração da turma (`isGuidedStudyEnabled: true`):

1. **Painel Administrativo (`/admin/presential/:classId`)**:
   - Libera no gerenciador da turma a inclusão de **Metas de Estudo** junto ao agendamento de **Aulas Presenciais**.
   - Permite cadastrar todos os 6 tipos de metas já consolidados nos Planos de Estudo:
     - **Meta de Aula**: Integração com Panda Video, seleção de videoaulas, título, descrição e tempo estimado.
     - **Meta de Material**: Anexo de arquivos PDF e links externos de apoio.
     - **Meta de Questões**: Meta focada em resolução de exercícios, quantidade de questões, PDF/Link.
     - **Meta de Lei Seca**: Leitura de legislação com indicação de artigos, PDF/Link.
     - **Meta de Flashcards**: Criação manual ou geração via **Inteligência Artificial (Gemini)** de baralhos de revisão.
     - **Meta de Resumo**: Síntese e material condensado.

2. **Área do Aluno (`/app/presential/:classId`)**:
   - Exibe no calendário/cronograma da turma os dois tipos de compromissos do dia:
     - **🏫 Aula Presencial**: Horário, professor, disciplina e local.
     - **🎯 Meta do Estudo Guiado**: Tipo de meta, tempo estimado, player de vídeo do Panda, leitor de PDF, gerador/estudador de flashcards com IA e cronômetro de estudo com marcação de conclusão (`Concluir Meta`).

---

## 2. Experiência do Usuário e Interface (UX/UI)

### A. Fluxo do Administrador
1. **Ativação da Função**:
   - No formulário de edição/criação da Turma Presencial, o administrador ativa a chave: `Ativar Estudo Guiado`.
2. **Gerenciamento no Cronograma**:
   - Na aba de Cronograma/Calendário da turma presencial, ao selecionar um dia do calendário, o administrador visualiza duas opções de criação:
     - `+ Agendar Aula Presencial` (mantém o modal existente de aulas presenciais).
     - `+ Adicionar Meta (Estudo Guiado)` (abre o modal unificado de metas).
3. **Modal de Criação de Meta**:
   - Seletor de Tipo de Meta (Aula, Material, Questões, Lei Seca, Flashcards com IA, Resumo).
   - Campos dinâmicos conforme o tipo escolhido (Videoaulas Panda, Upload de PDF, Links, Gerador IA de Flashcards).

### B. Fluxo do Aluno
1. **Acesso à Turma Presencial**:
   - O aluno entra na sua turma presencial e visualiza o cronograma semanal/mensal.
2. **Visualização do Dia**:
   - Dias com apenas aula presencial mostram o card tradicional da aula presencial.
   - Dias com Estudo Guiado mostram os cards de metas organizados estrategicamente.
3. **Execução da Meta**:
   - O aluno pode clicar na meta para abrir o leitor de PDF, assistir à aula no player Panda ou praticar com os Flashcards de IA.
   - Botão de marcação de conclusão (`Concluir Meta`) que registra o tempo de estudo e salva o progresso do aluno no banco de dados.

---

## 3. Decisões de Arquitetura e Segurança de Dados

> [!IMPORTANT]
> **Garantia de Não-Interferência**: Turmas presenciais que **não** estiverem com o Estudo Guiado ativado continuarão funcionando exatamente como hoje, sem qualquer alteração no visual ou na lógica das suas aulas presenciais e materiais.

### Modelo de Dados no Firestore

1. **Documento da Turma Presencial (`presential_classes/{classId}`)**:
   ```json
   {
     "id": "turma-123",
     "title": "Turma VIP Carreiras Policiais",
     "isGuidedStudyEnabled": true,
     "updatedAt": "2026-10-19T12:00:00Z"
   }
   ```

2. **Subcoleção de Cronograma/Agendamentos (`presential_classes/{classId}/schedule/{dateStr}`)**:
   ```json
   {
     "date": "2026-10-20",
     "presentialEvents": [
       {
         "id": "evt-1",
         "type": "presential_class",
         "title": "Direito Penal",
         "teacherName": "Prof. Lucas",
         "startTime": "19:00",
         "endTime": "22:00"
       }
     ],
     "guidedStudyMetas": [
       {
         "id": "meta-889",
         "type": "aula",
         "title": "Videoaula - Crimes Contra a Vida",
         "duration": 45,
         "disciplineName": "Direito Penal",
         "pandaVideoUrl": "https://...",
         "pandaVideoId": "v-12345"
       }
     ]
   }
   ```

3. **Progresso do Aluno (`users/{uid}/presential_progress/{classId}`)**:
   ```json
   {
     "meta-889": {
       "completed": true,
       "completedAt": "2026-10-20T20:15:00Z",
       "recordedMinutes": 45
     }
   }
   ```

---

## 4. Diagrama da Arquitetura do Sistema

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FIRESTORE DATABASE                              │
│                                                                        │
│  presential_classes/{classId}                                          │
│   ├── isGuidedStudyEnabled: boolean                                    │
│   └── schedule/{dateStr}                                               │
│        ├── presentialEvents: [ { id, teacher, time, room... } ]        │
│        └── guidedStudyMetas: [ { id, type, title, panda, pdf, ai... } ]│
│                                                                        │
│  users/{uid}/presential_progress/{classId}                             │
│   └── {metaId}: { completed: boolean, completedAt, recordedMinutes }   │
└────────────────────────────────────────────────────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
┌────────────────────────────────┐ ┌────────────────────────────────┐
│    GERENCIADOR ADMIN           │ │       ÁREA DO ALUNO            │
│ /admin/presential/:classId     │ │ /app/presential/:classId       │
│                                │ │                                │
│ [Switch: Estudo Guiado]        │ │ [Cronograma de Estudos]        │
│ [Agendar: Aula | Meta]         │ │  ├─ 🏫 Aula Presencial         │
│ [Modal Metas: Panda/PDF/IA]    │ │  └─ 🎯 Meta do Estudo Guiado   │
└────────────────────────────────┘ └────────────────────────────────┘
```

---

## 5. Plano de Execução Seguro (Etapas de Desenvolvimento)

1. **Etapa 1: Estruturação dos Types e Serviço (`presentialEventService.ts`)**:
   - Adicionar o campo `isGuidedStudyEnabled?: boolean` no tipo `PresentialClass`.
   - Adicionar funções no serviço para salvar e buscar metas de estudo por data na subcoleção de agendamentos da turma presencial.

2. **Etapa 2: Interface Administrativa (`PresentialClassManager.tsx`)**:
   - Adicionar o toggle `Ativar Estudo Guiado` no modal/painel da turma presencial.
   - Reutilizar os modais e seletores de metas já consolidados (com suporte a Panda Video, upload de PDF/Links e geração de Flashcards com IA Gemini).

3. **Etapa 3: Interface do Aluno (`StudentPresentialDetails.tsx`)**:
   - Atualizar a visualização do calendário do aluno na turma presencial para listar os dois blocos (Aulas Presenciais e Metas de Estudo Guiado).
   - Conectar o player Panda, leitor de PDF, Flashcards com IA e o botão de conclusão com salvamento no Firestore.

4. **Etapa 4: Validação e Teste de Regressão**:
   - Testar turmas presenciais sem Estudo Guiado (verificando que nada muda no funcionamento atual).
   - Testar turmas presenciais com Estudo Guiado (verificando o cadastro, carregamento e progresso do aluno).
