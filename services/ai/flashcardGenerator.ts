
import { Flashcard } from "../metaService";

/**
 * Converte arquivo (File) para base64.
 */
async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Gera Flashcards a partir de múltiplos arquivos PDF usando a rota de API segura do servidor
 */
export async function generateFlashcardsFromDocuments(
  files: File[],
  quantity?: number | null,
  customPrompt?: string | null
): Promise<Flashcard[]> {
  try {
    if (!files || files.length === 0) {
      throw new Error("Nenhum arquivo fornecido.");
    }

    console.log(`[FlashcardGenerator] Convertendo ${files.length} arquivos para base64...`);

    const filesBase64 = await Promise.all(
      files.map(async (file) => {
        const base64 = await fileToBase64(file);
        return {
          name: file.name,
          type: file.type || "application/pdf",
          base64: base64
        };
      })
    );

    console.log(`[FlashcardGenerator] Enviando requisição para a API segura (/api/generate-flashcards)...`);

    const response = await fetch('/api/generate-flashcards', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        files: filesBase64,
        prompt: customPrompt || undefined,
        quantity: quantity || undefined
      })
    });

    const result = await response.json();
    
    if (!response.ok || !result.success) {
      throw new Error(result.error || "Erro ao gerar flashcards via IA.");
    }

    console.log(`[FlashcardGenerator] Sucesso! ${result.cards.length} cards gerados pelo servidor.`);

    // Mapeamento para o formato esperado pelo frontend
    const processedCards: Flashcard[] = result.cards.map((card: any, index: number) => ({
      id: `ai-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
      front: card.front || card.question || '',
      back: card.back || card.answer || ''
    }));

    return processedCards;

  } catch (error: any) {
    console.error("[FlashcardGenerator] ERRO DETALHADO:", error);
    throw new Error(`Falha na IA: ${error.message || error.toString()}`);
  }
}

