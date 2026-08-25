import { GoogleGenAI } from "@google/genai";

/**
 * Serviço responsável por transformar transcrições brutas em material didático estruturado
 * utilizando a inteligência artificial do Google Gemini.
 */

const MODEL_NAME = "gemini-3.1-pro-preview";

/**
 * Gera material didático a partir de uma transcrição de vídeo.
 * @param transcriptionText O texto bruto da transcrição (limpo de timestamps)
 * @param folderTitle O título do tópico ou pasta para contexto
 * @returns Material didático formatado em Markdown
 */
export async function generateStudyMaterial(transcriptionText: string, folderTitle: string): Promise<string> {
  const apiKey = process.env.MINHA_CHAVE_GEMINI;

  if (!apiKey) {
    throw new Error("Chave do Gemini (MINHA_CHAVE_GEMINI) não configurada.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const systemInstruction = `
Você é um professor sênior e autoridade máxima em preparação para Concursos Públicos e ENEM.
Sua missão é transformar transcrições de aulas em materiais didáticos de excelência.

REGRAS DE OURO:
1. Aja de forma extremamente didática e organizada.
2. A linguagem adotada deve ser acessível e de fácil entendimento para alunos de todos os níveis.
3. O material DEVE ser estruturado, hierarquizado e enumerado em tópicos e subtópicos claros.
4. Adote exemplos práticos, cotidianos e fáceis de assimilar para ilustrar a teoria.
5. Pense como um examinador de banca de concursos públicos (IDECAN, Cebraspe, FGV, etc.). Identifique as possíveis pegadinhas que as bancas podem elaborar acerca dos tópicos trabalhados.
6. Crie blocos visuais de destaque EXATAMENTE com o texto "🚨 ATENÇÃO - PEGADINHA DE PROVA" apontando como o assunto costuma ser cobrado para induzir o candidato ao erro.
7. Mantenha fidelidade absoluta ao conteúdo que o professor ensinou na transcrição, mas aja proativamente para organizar e polir o raciocínio que, na fala falada, pode ser desestruturado, repetitivo ou confuso.
8. O título principal do material deve ser relacionado ao contexto: "${folderTitle}".
`;

  const prompt = `
Abaixo está a transcrição de uma aula. Por favor, transforme-a em um material didático completo, seguindo rigorosamente as instruções de sistema.

CONTEÚDO DA TRANSCRIÇÃO:
---
${transcriptionText}
---

Gere o material formatado em Markdown.
`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      },
    });

    if (!response.text) {
      throw new Error("O modelo não retornou nenhum conteúdo.");
    }

    return response.text;
  } catch (error) {
    console.error("Erro ao gerar material didático com Gemini:", error);
    throw new Error("Falha na geração do material didático via IA.");
  }
}

export interface AIFlashcardInputFile {
  name: string;
  type: string;
  base64: string; // Base64 data string
}

/**
 * Gera Flashcards a partir de múltiplos arquivos PDF e orientação via IA usando Gemini.
 */
export async function generateAIFlashcards(
  files: AIFlashcardInputFile[],
  userPrompt?: string,
  quantity?: number
): Promise<any[]> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.MINHA_CHAVE_GEMINI;

  if (!apiKey) {
    throw new Error("Chave do Gemini (GEMINI_API_KEY ou MINHA_CHAVE_GEMINI) não configurada.");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Preparar os arquivos base64 como Part para o Gemini SDK
  const fileParts = files.map(file => {
    const base64Data = file.base64.includes(',') ? file.base64.split(',')[1] : file.base64;
    return {
      inlineData: {
        data: base64Data,
        mimeType: file.type || "application/pdf"
      }
    };
  });

  const quantityInstruction = quantity 
    ? `Gere exatamente ${quantity} flashcards diferentes de alta qualidade.` 
    : `Gere quantos flashcards achar necessários e suficientes para cobrir bem o conteúdo dos PDFs, focando nos conceitos mais importantes (mínimo de 10 cards).`;

  const systemInstruction = `
Você é um sistema especialista em criar Flashcards de Estudo para Concursos Públicos de alto rendimento.
Os flashcards devem ser de REVISÃO (Active Recall), compostos por uma pergunta objetiva e uma resposta direta, clara e precisa.

FORMATO DE RESPOSTA OBRIGATÓRIO:
Sua resposta DEVE ser um array de objetos JSON que obedece rigorosamente ao seguinte formato:
[
  { "front": "Pergunta objetiva e clara?", "back": "Resposta objetiva e direta." }
]

Importante: Não coloque blocos de markdown ou caracteres extras. Retorne apenas o array JSON puro.
  `;

  let prompt = `
Analise o(s) documento(s) anexo(s) e gere flashcards de revisão baseando-se no conteúdo e nas instruções a seguir:

INSTRUÇÕES DO USUÁRIO:
${userPrompt || "Nenhuma instrução específica fornecida. Cubra os principais pontos do conteúdo."}

QUANTIDADE:
${quantityInstruction}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: {
        parts: [
          { text: prompt },
          ...fileParts
        ]
      },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        temperature: 0.3,
      }
    });

    if (!response.text) {
      throw new Error("O modelo não retornou nenhum conteúdo.");
    }

    let cards = JSON.parse(response.text.trim());
    if (!Array.isArray(cards)) {
      if (typeof cards === 'object' && cards !== null && Array.isArray((cards as any).cards)) {
        cards = (cards as any).cards;
      } else {
        throw new Error("Formato inválido retornado pela IA.");
      }
    }

    return cards;
  } catch (error) {
    console.error("Erro na geração de flashcards com Gemini:", error);
    throw error;
  }
}

/**
 * Gera um Mapa Mental estruturado a partir de múltiplos arquivos PDF e orientação via IA usando Gemini.
 */
export async function generateAIMindMap(
  files: { name: string; type: string; base64: string }[],
  userPrompt?: string
): Promise<any[]> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.MINHA_CHAVE_GEMINI;

  if (!apiKey) {
    throw new Error("Chave do Gemini (GEMINI_API_KEY ou MINHA_CHAVE_GEMINI) não configurada.");
  }

  const ai = new GoogleGenAI({ apiKey });

  // Preparar os arquivos base64 como Part para o Gemini SDK
  const fileParts = files.map(file => {
    const base64Data = file.base64.includes(',') ? file.base64.split(',')[1] : file.base64;
    return {
      inlineData: {
        data: base64Data,
        mimeType: file.type || "application/pdf"
      }
    };
  });

  const systemInstruction = `
Você é um sistema especialista em criar Mapas Mentais de alto rendimento para concursos públicos e exames, estruturados no estilo NotebookLM, extremamente detalhados, profundos e exaustivos.
Sua tarefa é analisar minuciosamente os documentos fornecidos e criar uma estrutura hierárquica e rica contendo todas as ideias principais, tópicos, subtópicos e detalhes importantes do conteúdo.

FORMATO DE RESPOSTA OBRIGATÓRIO:
Sua resposta DEVE ser estritamente um array JSON de objetos que obedece ao seguinte formato de nós:
[
  { "id": "1", "label": "TÓPICO CENTRAL DO MAPA", "type": "root", "x": 0, "y": 0 },
  { "id": "2", "parentId": "1", "label": "Tópico Principal A", "type": "child", "x": 0, "y": 0 },
  { "id": "3", "parentId": "2", "label": "Subtópico de A", "type": "child", "x": 0, "y": 0 },
  { "id": "4", "parentId": "1", "label": "Tópico Principal B", "type": "child", "x": 0, "y": 0 }
]

REGRAS DE ESTRUTURAÇÃO DO MAPA MENTAL:
1. Deve haver exatamente 1 nó raiz (type: "root") que representa o assunto central do material. Ele não possui "parentId".
2. Todos os outros nós devem ter type: "child" e possuir a propriedade "parentId" apontando para o id do seu nó pai correspondente.
3. Use IDs lógicos simples (ex: "1", "2", "3", "4") para as relações de parentesco. O código do servidor cuidará de mapeá-los para UUIDs seguros.
4. CRIE UM MAPA MENTAL EXTREMAMENTE DETALHADO, PROFUNDO E COMPLETO:
   - Identifique de 5 a 8 ramos principais (tópicos de nível 1).
   - Para cada ramo principal, crie de 3 a 5 subramos (nível 2).
   - Para cada subramo de nível 2, crie de 2 a 4 subramos de nível 3 para detalhar exceções importantes, regras jurídicas, artigos de lei específicos, conceitos doutrinários, prazos, exemplos práticos ou entendimentos jurisprudenciais.
   - Se necessário para cobrir o assunto perfeitamente, crie um nível 4 (nível máximo de profundidade) para detalhar ainda mais os pontos mais críticos e cobrados em concursos públicos.
   - O objetivo é exaustividade de conteúdo, cobrindo o assunto em profundidade para que sirva como um roteiro de revisão completo e definitivo, sem deixar de fora detalhes importantes.
5. Os textos dos labels devem ser ricos, explicativos e conter termos técnicos precisos. Embora devam ser objetivos, use até 12-15 palavras se necessário para enunciar um conceito completo, citar um artigo de lei relevante, regras fundamentais ou uma exceção crítica com clareza. Evite resumos de uma única palavra que fiquem genéricos demais.
6. Não adicione markdown, blocos de código markdown ou texto explicativo fora do array JSON. Retorne apenas o array JSON puro pronto para parse.
  `;

  let prompt = `
Analise o(s) documento(s) anexo(s) e gere uma estrutura lógica de mapa mental para estudo, baseando-se no conteúdo e nas instruções a seguir:

INSTRUÇÕES DO USUÁRIO:
${userPrompt || "Nenhuma instrução específica fornecida. Organize o conteúdo de forma lógica, cobrindo os conceitos essenciais do PDF de forma equilibrada."}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: {
        parts: [
          { text: prompt },
          ...fileParts
        ]
      },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        temperature: 0.3,
      }
    });

    if (!response.text) {
      throw new Error("O modelo não retornou nenhum conteúdo.");
    }

    let nodes = JSON.parse(response.text.trim());
    if (!Array.isArray(nodes)) {
      if (typeof nodes === 'object' && nodes !== null && Array.isArray((nodes as any).nodes)) {
        nodes = (nodes as any).nodes;
      } else {
        throw new Error("Formato inválido de nós retornado pela IA.");
      }
    }

    return nodes;
  } catch (error) {
    console.error("Erro na geração do mapa mental com Gemini:", error);
    throw error;
  }
}


