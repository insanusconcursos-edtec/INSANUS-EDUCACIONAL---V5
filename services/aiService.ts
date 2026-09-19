
import { AIMindMapNode } from "./aiService";

export interface AIMindMapNode {
  id: string;
  label: string;
  children?: AIMindMapNode[];
}

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
 * Função Principal: Gera a Estrutura do Mapa Mental via IA usando a rota de API segura do servidor
 * @param pdfFile Arquivo PDF ou Imagem para análise
 */
export async function generateMindMapStructure(pdfFile: File): Promise<AIMindMapNode> {
  try {
    if (!pdfFile) throw new Error("Nenhum arquivo PDF fornecido para a IA.");

    console.log("[aiService] Convertendo arquivo para base64...");
    const base64 = await fileToBase64(pdfFile);

    console.log("[aiService] Enviando requisição para a API segura (/api/generate-mindmap)...");
    const response = await fetch('/api/generate-mindmap', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        files: [
          {
            name: pdfFile.name,
            type: pdfFile.type || "application/pdf",
            base64: base64
          }
        ],
        prompt: "Crie uma estrutura detalhada e profunda focada nos principais tópicos e detalhes do material de estudo."
      })
    });

    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || "Erro ao gerar o mapa mental via IA.");
    }

    const flatNodes = result.nodes;
    if (!flatNodes || !Array.isArray(flatNodes) || flatNodes.length === 0) {
      throw new Error("Estrutura inválida retornada pela API.");
    }

    console.log(`[aiService] Recebidos ${flatNodes.length} nós planos do servidor. Convertendo para árvore hierárquica...`);

    // Encontra o nó raiz (type === 'root' ou parentId ausente)
    const rootNode = flatNodes.find((n: any) => !n.parentId || n.type === 'root') || flatNodes[0];
    if (!rootNode) {
      throw new Error("Nenhum nó raiz encontrado no mapa mental gerado.");
    }

    // Cria o mapeamento de ID -> Nó com lista de filhos
    const map = new Map<string, AIMindMapNode>();
    flatNodes.forEach((node: any) => {
      map.set(node.id, {
        id: node.id,
        label: node.label || 'Sem título',
        children: []
      });
    });

    // Vincula cada nó ao seu pai correspondente
    flatNodes.forEach((node: any) => {
      if (node.parentId && node.id !== rootNode.id) {
        const parent = map.get(node.parentId);
        const child = map.get(node.id);
        if (parent && child) {
          parent.children = parent.children || [];
          parent.children.push(child);
        }
      }
    });

    const nestedTree = map.get(rootNode.id);
    if (!nestedTree) {
      throw new Error("Erro ao estruturar árvore hierárquica do mapa mental.");
    }

    return nestedTree;

  } catch (error: any) {
    console.error("[aiService] ERRO NA GERAÇÃO IA:", error);
    throw new Error(`Falha ao gerar mapa: ${error.message || error.toString()}`);
  }
}

