import React, { useState, useEffect, useRef, useCallback } from 'react';
import { MindMapNode } from '../../../../../services/metaService';
import VisualNode, { TreeNode } from './VisualNode';
import NodeToolbar from './NodeToolbar';
import BottomControls from './BottomControls';
import { PostItEditor, PostItViewer, PostItNote } from './PostItComponents';
import { CheckCircle2, Sparkles, Upload, X, FileText, Loader2, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';

// Helper to convert a File to base64
const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

interface MindMapFullscreenProps {
  nodes: MindMapNode[];
  onChange: (nodes: MindMapNode[], isManualSave?: boolean) => void;
  onClose: () => void;
  readOnly?: boolean;
  onRestart?: () => void | Promise<void>;
}

// Helper: Flat List -> Tree
const buildTree = (flatNodes: MindMapNode[]): TreeNode | null => {
  if (!flatNodes || flatNodes.length === 0) return null;

  const nodeMap = new Map<string, TreeNode>();
  let root: TreeNode | null = null;

  // 1. Create all TreeNodes
  flatNodes.forEach(node => {
    // Cast notes to PostItNote[] (structural compatible) to match TreeNode definition
    nodeMap.set(node.id, { 
        ...node, 
        children: [], 
        collapsed: node.collapsed ?? false, 
        notes: (node.notes || []) as unknown as PostItNote[] 
    });
  });

  // 2. Link children
  flatNodes.forEach(node => {
    const treeNode = nodeMap.get(node.id)!;
    if (node.parentId && nodeMap.has(node.parentId)) {
      const parent = nodeMap.get(node.parentId)!;
      parent.children = parent.children || [];
      parent.children.push(treeNode);
    } else {
      if (!root) root = treeNode; // Assume first root found is the main one
    }
  });

  return root;
};

// Helper: Tree -> Flat List
const flattenTree = (root: TreeNode): MindMapNode[] => {
  const flat: MindMapNode[] = [];
  const traverse = (node: TreeNode) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { children, ...rest } = node;
    // Cast notes back to MindMapNote[] if needed, but structure matches
    flat.push(rest as unknown as MindMapNode);
    if (children) {
      children.forEach(traverse);
    }
  };
  traverse(root);
  return flat;
};

// Helper: Update specific node in tree immutably
const modifyTree = (node: TreeNode, targetId: string, updateFn: (n: TreeNode) => TreeNode): TreeNode => {
  if (node.id === targetId) {
    return updateFn(node);
  }
  if (node.children) {
    return {
      ...node,
      children: node.children.map(child => modifyTree(child, targetId, updateFn))
    };
  }
  return node;
};

// Helper: Find Node in Tree
const findNode = (root: TreeNode, id: string): TreeNode | null => {
    if (root.id === id) return root;
    if (root.children) {
        for (const child of root.children) {
            const found = findNode(child, id);
            if (found) return found;
        }
    }
    return null;
};

const MindMapFullscreen: React.FC<MindMapFullscreenProps> = ({ nodes, onChange, onClose, readOnly = false, onRestart }) => {
  const [treeData, setTreeData] = useState<TreeNode | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 }); // Pan offset
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Canvas Drag State (Pan)
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  
  // Safe Restart State
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // Toolbar State
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Notes State
  const [editingNote, setEditingNote] = useState<PostItNote | undefined>(undefined); // If set, editor open
  const [isNoteEditorOpen, setIsNoteEditorOpen] = useState(false);
  const [viewingNotesId, setViewingNotesId] = useState<string | null>(null); // Node ID whose notes we are viewing
  const [targetNodeForNote, setTargetNodeForNote] = useState<string | null>(null);

  // Feedback State (Novo)
  const [showSuccessToast, setShowSuccessToast] = useState(false);

  // AI Generation State
  const [isAIGeneratorOpen, setIsAIGeneratorOpen] = useState(false);
  const [aiFiles, setAiFiles] = useState<File[]>([]);
  const [aiPrompt, setAiPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOverFile = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(true);
  };

  const handleDragLeaveFile = () => {
    setIsDraggingFile(false);
  };

  const handleDropFile = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (e.dataTransfer.files) {
      const filesArray = Array.from(e.dataTransfer.files).filter(file => file.type === 'application/pdf');
      if (filesArray.length === 0) {
        toast.error("Por favor, envie apenas arquivos em formato PDF.");
        return;
      }
      setAiFiles(prev => [...prev, ...filesArray]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files).filter(file => file.type === 'application/pdf');
      if (filesArray.length === 0) {
        toast.error("Por favor, envie apenas arquivos em formato PDF.");
        return;
      }
      setAiFiles(prev => [...prev, ...filesArray]);
    }
  };

  const removeAiFile = (index: number) => {
    setAiFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleGenerateAIMindMap = async () => {
    if (aiFiles.length === 0) {
      toast.error("Por favor, adicione pelo menos um arquivo PDF.");
      return;
    }

    setIsGenerating(true);
    try {
      const filesBase64 = await Promise.all(
        aiFiles.map(async (file) => {
          const base64 = await fileToBase64(file);
          return {
            name: file.name,
            type: file.type || "application/pdf",
            base64: base64
          };
        })
      );

      const response = await fetch('/api/generate-mindmap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          files: filesBase64,
          prompt: aiPrompt
        })
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || "Erro ao gerar o mapa mental via IA");
      }

      const generatedNodes = result.nodes;
      const newTree = buildTree(generatedNodes);

      if (newTree) {
        setTreeData(newTree);
        // Salva silenciosamente o mapa gerado
        onChange(generatedNodes, false);
        toast.success("Mapa Mental gerado com sucesso por IA!");
        setIsAIGeneratorOpen(false);
        setAiFiles([]);
        setAiPrompt('');
        setTimeout(() => {
          fitView();
        }, 300);
      } else {
        throw new Error("Erro ao construir a árvore do mapa mental.");
      }

    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Erro na geração do mapa mental.");
    } finally {
      setIsGenerating(false);
    }
  };

  // --- CUSTOM FIT VIEW SIMULATION ---
  // Reset position to (0,0) relative to the start-aligned container
  const fitView = useCallback(() => {
    setPosition({ x: 0, y: 0 }); 
    setScale(1);
  }, []);

  // --- INITIALIZATION EFFECT ---
  useEffect(() => {
    let tree = buildTree(nodes);
    
    // LÓGICA DE INICIALIZAÇÃO SEGURA (Modo Aluno)
    // 1. Identificar Raiz e Filhos
    // 2. Ocultar (Collapse) níveis profundos para "Expansão Gradual"
    if (readOnly && tree && nodes.length > 0) {
        const setInitialCollapsedState = (node: TreeNode, depth: number): TreeNode => {
            // Regra de Visibilidade Inicial:
            // Depth 0 (Raiz): Expandida (collapsed = false)
            // Depth 1 (Filhos): Colapsados (collapsed = true) -> Isso oculta os Netos (Depth 2)
            const shouldCollapse = depth >= 1;
            
            let newChildren = node.children;
            if (newChildren) {
                newChildren = newChildren.map(child => setInitialCollapsedState(child, depth + 1));
            }

            return { ...node, collapsed: shouldCollapse, children: newChildren };
        };

        tree = setInitialCollapsedState(tree, 0);
    }

    setTreeData(tree);
    
    // 3. Centralização da Câmera (Delay para aguardar renderização do DOM)
    if (nodes.length > 0) {
        setTimeout(() => {
            fitView();
        }, 300);
    }
  }, [nodes, readOnly, fitView]);

  // --- PAN & ZOOM ---
  const handleWheel = (e: React.WheelEvent) => {
    // Zoom logic to focus on mouse pointer
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const nextScale = Math.min(Math.max(scale * delta, 0.1), 5);
    
    // Mouse position relative to viewport (container is fixed inset-0)
    const mouseX = e.clientX;
    const mouseY = e.clientY;

    // Calculate new position to keep the point under cursor stable
    // Formula: newPos = mouse - (mouse - oldPos) * (newScale / oldScale)
    const ratio = nextScale / scale;
    const nextX = mouseX - (mouseX - position.x) * ratio;
    const nextY = mouseY - (mouseY - position.y) * ratio;

    setPosition({ x: nextX, y: nextY });
    setScale(nextScale);
  };

  // --- MOUSE DRAG HANDLERS (Manual Pan Implementation) ---
  const handleMouseDown = (e: React.MouseEvent) => {
    // Left Click (0) or Middle Click (1) on background triggers pan
    // Ignora se clicar em botões ou interativos (handled by stopPropagation downstream)
    if (e.button === 0 || e.button === 1) {
        setIsDraggingCanvas(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        // REMOVIDO: if (!readOnly) setSelectedId(null); // Mantém painel aberto ao clicar no fundo
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingCanvas) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        setPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
        setDragStart({ x: e.clientX, y: e.clientY });
    }
  };

  const handleMouseUp = () => {
    setIsDraggingCanvas(false);
  };

  // --- NODE UPDATES ---

  const handleUpdateNode = (nodeId: string, changes: Partial<TreeNode>) => {
    if (readOnly && changes.collapsed === undefined) return; 
    
    setTreeData(prevTree => {
        if (!prevTree) return null;

        // Se expandir no modo leitura, forçar fechamento dos filhos (Expansão Gradual no Clique)
        if (readOnly && changes.collapsed === false) {
            return modifyTree(prevTree, nodeId, (node) => {
                const updatedNode = { ...node, ...changes };
                if (updatedNode.children && updatedNode.children.length > 0) {
                    updatedNode.children = updatedNode.children.map(child => ({
                        ...child,
                        collapsed: true // Fecha os netos ao abrir o filho
                    }));
                }
                return updatedNode;
            });
        }

        return modifyTree(prevTree, nodeId, (node) => ({ ...node, ...changes }));
    });
  };

  const handleSave = () => {
    if (treeData && !readOnly) {
        const flat = flattenTree(treeData);
        onChange(flat, true);
        
        // Ativar notificação de sucesso
        setShowSuccessToast(true);
        setTimeout(() => setShowSuccessToast(false), 3000);
    }
  };

  const handleCloseWrapper = () => {
    onClose();
  };

  const handleSelectNode = (nodeId: string) => {
    setSelectedId(nodeId);
  };

  // --- ACTIONS ---

  const handleAddChild = (parentId: string) => {
    if(readOnly) return;
    const newNode: TreeNode = {
        id: crypto.randomUUID(),
        label: 'Novo Tópico',
        x: 0, y: 0,
        color: '#3b82f6',
        type: 'child',
        parentId: parentId,
        collapsed: false,
        children: []
    };

    setTreeData(prev => {
        if(!prev) return newNode; 
        return modifyTree(prev, parentId, (node) => ({
            ...node,
            children: [...(node.children || []), newNode],
            collapsed: false // Expand parent to show new child
        }));
    });

    // Auto-focus on the new subtopic
    setSelectedId(newNode.id);
  };

  const handleReorder = (id: string, direction: 'up' | 'down') => {
    if (readOnly || !treeData) return;
    
    const nodeToMove = findNode(treeData, id);
    if (!nodeToMove || !nodeToMove.parentId) return;

    const parentId = nodeToMove.parentId;

    setTreeData(prev => {
        if (!prev) return null;
        return modifyTree(prev, parentId, (parent) => {
            if (!parent.children) return parent;
            const newChildren = [...parent.children];
            const index = newChildren.findIndex(c => c.id === id);
            if (index === -1) return parent;

            const targetIndex = direction === 'up' ? index - 1 : index + 1;
            if (targetIndex < 0 || targetIndex >= newChildren.length) return parent;

            // Swap imutável
            const temp = newChildren[index];
            newChildren[index] = newChildren[targetIndex];
            newChildren[targetIndex] = temp;

            return { ...parent, children: newChildren };
        });
    });
  };

  const handleMoveNode = (draggedId: string, targetId: string) => {
    if (readOnly || !treeData || draggedId === targetId) return;

    // 1. Validação: Impedir ciclos (não pode soltar em si mesmo ou descendente)
    const draggedNode = findNode(treeData, draggedId);
    if (!draggedNode) return;

    const isDescendant = (parent: TreeNode, id: string): boolean => {
      if (!parent.children) return false;
      return parent.children.some(child => child.id === id || isDescendant(child, id));
    };

    if (isDescendant(draggedNode, targetId)) return;

    // 2. Re-parenting Imutável
    setTreeData(prev => {
      if (!prev) return null;

      // Se tentar mover a raiz, ignorar (raiz não tem pai)
      if (prev.id === draggedId) return prev;

      let extractedNode: TreeNode | null = null;

      // Função para remover o nó e capturá-lo
      const removeAndCapture = (node: TreeNode): TreeNode => {
        if (node.children) {
          const foundIndex = node.children.findIndex(c => c.id === draggedId);
          if (foundIndex !== -1) {
            extractedNode = node.children[foundIndex];
            const newChildren = [...node.children];
            newChildren.splice(foundIndex, 1);
            return { ...node, children: newChildren };
          }
          return {
            ...node,
            children: node.children.map(removeAndCapture)
          };
        }
        return node;
      };

      const treeWithoutNode = removeAndCapture(prev);
      if (!extractedNode) return prev;

      // Inserir no novo pai
      const nodeWithNewParent = { ...extractedNode, parentId: targetId };
      return modifyTree(treeWithoutNode, targetId, (parent) => ({
        ...parent,
        children: [...(parent.children || []), nodeWithNewParent],
        collapsed: false // Expandir para mostrar o novo filho
      }));
    });
  };

  const handleDeleteNode = (id: string) => {
    if(readOnly) return;
    if (treeData?.id === id) {
        setTreeData(null);
        return;
    }
    
    const deleteFromTree = (node: TreeNode): TreeNode => {
        if (!node.children) return node;
        return {
            ...node,
            children: node.children.filter(c => c.id !== id).map(deleteFromTree)
        };
    };
    
    if (treeData) {
        setTreeData(deleteFromTree(treeData));
    }
    setSelectedId(null);
  };

  const handleAddNote = (nodeId: string) => {
      setTargetNodeForNote(nodeId);
      setEditingNote(undefined);
      setIsNoteEditorOpen(true);
  };

  const handleSaveNote = (note: PostItNote) => {
      if (!targetNodeForNote) return;
      
      setTreeData(prev => {
          if (!prev) return null;
          return modifyTree(prev, targetNodeForNote, (node) => ({
              ...node,
              notes: [...(node.notes || []), note]
          }));
      });

      setIsNoteEditorOpen(false);
  };

  const handleEditNote = (note: PostItNote) => {
      if (viewingNotesId) {
          setTargetNodeForNote(viewingNotesId);
          setEditingNote(note);
          setIsNoteEditorOpen(true);
      }
  };

  const handleDeleteNote = (noteId: string) => {
      if (!viewingNotesId) return;
      setTreeData(prev => {
          if (!prev) return null;
          return modifyTree(prev, viewingNotesId, (node) => ({
              ...node,
              notes: (node.notes || []).filter(n => n.id !== noteId)
          }));
      });
  };



  // Get current notes being viewed
  const viewingNode = viewingNotesId && treeData ? findNode(treeData, viewingNotesId) : null;
  
  return (
    <div 
        className="fixed inset-0 z-[100] bg-zinc-950 overflow-hidden text-white" 
        ref={containerRef} 
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isDraggingCanvas ? 'grabbing' : 'grab' }}
    >
        
        <div 
            className="absolute inset-0 pointer-events-none opacity-20"
            style={{
                backgroundImage: 'radial-gradient(#444 1px, transparent 1px)',
                backgroundSize: `${20 * scale}px ${20 * scale}px`,
                backgroundPosition: `${position.x}px ${position.y}px`
            }}
        />

        <div 
            className="absolute origin-top-left transition-transform duration-500 ease-out w-full h-full flex items-center justify-start pl-32"
            style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`
            }}
        >
            {treeData ? (
                <VisualNode 
                    node={treeData}
                    depth={0}
                    selectedId={selectedId}
                    onSelect={handleSelectNode}
                    onToggle={(id) => handleUpdateNode(id, { collapsed: !findNode(treeData, id)?.collapsed })}
                    onEdit={handleUpdateNode}
                    onMoveNode={handleMoveNode}
                    onViewNotes={setViewingNotesId}
                    readOnly={readOnly}
                />
            ) : (
                <div className="text-zinc-500 pointer-events-none ml-20">Mapa vazio</div>
            )}
        </div>

        {!readOnly && selectedId && treeData && findNode(treeData, selectedId) && (
            <NodeToolbar 
                node={findNode(treeData, selectedId)!}
                onUpdate={(id, data) => handleUpdateNode(id, data)}
                onAddChild={handleAddChild}
                onDelete={handleDeleteNode}
                onClose={() => setSelectedId(null)}
                onReorder={handleReorder} 
                onAddNote={handleAddNote}
            />
        )}

        {/* Success Toast Notification */}
        {showSuccessToast && (
            <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-full shadow-[0_0_20px_rgba(16,185,129,0.4)] border border-emerald-400/50 animate-in slide-in-from-bottom-5 fade-in duration-300 pointer-events-none">
                <CheckCircle2 size={20} className="text-white" />
                <span className="text-sm font-bold uppercase tracking-wide">Mapa salvo com sucesso!</span>
            </div>
        )}

        <BottomControls 
            onZoomIn={() => setScale(s => Math.min(s + 0.1, 5))}
            onZoomOut={() => setScale(s => Math.max(s - 0.1, 0.1))}
            onReset={fitView}
            onSave={handleSave}
            onClose={handleCloseWrapper}
            onGenerateAI={readOnly ? undefined : () => setIsAIGeneratorOpen(true)}
            onRestart={(!readOnly && onRestart) ? () => setIsResetConfirmOpen(true) : undefined}
            scale={scale}
        />

        {isNoteEditorOpen && (
            <PostItEditor 
                initialNote={editingNote}
                onSave={handleSaveNote}
                onCancel={() => setIsNoteEditorOpen(false)}
            />
        )}

        {viewingNode && (
            <PostItViewer 
                notes={viewingNode.notes || []}
                nodeLabel={viewingNode.label}
                onClose={() => setViewingNotesId(null)}
                onEdit={handleEditNote}
                onDelete={handleDeleteNote}
                onAdd={() => handleAddNote(viewingNode.id)}
                readOnly={readOnly}
            />
        )}

        {/* AI GENERATOR MODAL */}
        {isAIGeneratorOpen && (
            <div 
                className="fixed inset-0 z-[150] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200"
                onKeyDown={e => e.stopPropagation()}
            >
                <div 
                    className="w-full max-w-xl bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl flex flex-col gap-5 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200"
                    onKeyDown={e => e.stopPropagation()}
                >
                    {/* MODAL HEADER */}
                    <div className="flex items-center justify-between border-b border-zinc-900 pb-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-xl bg-gradient-to-r from-pink-500/10 to-purple-500/10 border border-purple-500/20 text-purple-400">
                                <Sparkles size={20} />
                            </div>
                            <div>
                                <h3 className="text-base font-black uppercase tracking-tight text-white leading-tight">Gerar Mapa Mental com IA</h3>
                                <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest mt-0.5">Criado através do Google Gemini</p>
                            </div>
                        </div>
                        <button 
                            type="button" 
                            onClick={() => { if (!isGenerating) setIsAIGeneratorOpen(false); }}
                            className="p-1.5 hover:bg-zinc-900 rounded-full text-zinc-500 hover:text-white transition-all cursor-pointer"
                            disabled={isGenerating}
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* DRAG & DROP AREA */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                            Arquivos PDF de Referência
                        </label>
                        <div 
                            onDragOver={handleDragOverFile}
                            onDragLeave={handleDragLeaveFile}
                            onDrop={handleDropFile}
                            onClick={() => { if (!isGenerating && fileInputRef.current) fileInputRef.current.click(); }}
                            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                                isDraggingFile 
                                    ? 'border-purple-500 bg-purple-500/10' 
                                    : 'border-zinc-800 hover:border-zinc-700 bg-zinc-900/50 hover:bg-zinc-900'
                            }`}
                        >
                            <input 
                                type="file" 
                                ref={fileInputRef}
                                onChange={handleFileSelect}
                                multiple
                                accept="application/pdf"
                                className="hidden"
                                disabled={isGenerating}
                            />
                            <div className="flex flex-col items-center gap-2">
                                <div className="p-3 bg-zinc-950 rounded-2xl border border-zinc-800 text-zinc-400">
                                    <Upload size={24} />
                                </div>
                                <span className="text-xs font-black uppercase tracking-tight text-zinc-300">Arraste seus PDFs aqui</span>
                                <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">ou clique para procurar no seu dispositivo</span>
                            </div>
                        </div>
                    </div>

                    {/* LISTA DE ARQUIVOS ADICIONADOS */}
                    {aiFiles.length > 0 && (
                        <div className="space-y-2">
                            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                Arquivos Selecionados ({aiFiles.length})
                            </label>
                            <div className="bg-zinc-900/40 border border-zinc-900 rounded-2xl p-2.5 space-y-1.5 max-h-[120px] overflow-y-auto scrollbar-thin">
                                {aiFiles.map((file, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-2 bg-zinc-950 rounded-xl border border-zinc-900/80">
                                        <div className="flex items-center gap-2 truncate">
                                            <FileText size={14} className="text-purple-500 shrink-0" />
                                            <span className="text-xs text-zinc-300 font-bold truncate max-w-[320px]">{file.name}</span>
                                        </div>
                                        <button 
                                            type="button" 
                                            onClick={() => removeAiFile(idx)}
                                            className="p-1 hover:bg-zinc-900 rounded text-zinc-500 hover:text-red-500 transition-colors"
                                            disabled={isGenerating}
                                        >
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* PROMPT DE ORIENTAÇÃO */}
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5">
                            Instruções / Prompt de Orientação
                        </label>
                        <textarea 
                            value={aiPrompt}
                            onChange={e => setAiPrompt(e.target.value)}
                            placeholder="Ex: Foque apenas na estruturação dos Princípios Fundamentais descritos do artigo 1º ao 4º da Constituição. Crie subtópicos objetivos para cada princípio."
                            rows={3}
                            disabled={isGenerating}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-white placeholder-zinc-700 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/20 resize-none"
                        />
                    </div>

                    {/* AVISO DE SUBSTITUIÇÃO */}
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-2xl flex gap-3 items-start">
                        <AlertTriangle size={18} className="shrink-0 mt-0.5 animate-pulse" />
                        <div className="text-[10px] font-bold uppercase tracking-wide leading-normal">
                            Atenção: A geração por IA irá substituir completamente a estrutura do mapa mental atual. Salve seu trabalho se necessário antes de prosseguir.
                        </div>
                    </div>

                    {/* ACTION BUTTONS */}
                    <div className="flex gap-3 border-t border-zinc-900 pt-4 mt-1">
                        <button 
                            type="button" 
                            onClick={() => { if (!isGenerating) setIsAIGeneratorOpen(false); }}
                            className="flex-1 py-3 text-xs font-bold uppercase tracking-widest text-zinc-500 hover:text-white transition-colors cursor-pointer"
                            disabled={isGenerating}
                        >
                            Cancelar
                        </button>
                        <button 
                            type="button"
                            onClick={handleGenerateAIMindMap}
                            disabled={isGenerating || aiFiles.length === 0}
                            className="flex-1 py-3 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-purple-900/30 flex items-center justify-center gap-2 cursor-pointer"
                        >
                            {isGenerating ? (
                                <>
                                    <Loader2 size={14} className="animate-spin" />
                                    Gerando Mapa...
                                </>
                            ) : (
                                <>
                                    <Sparkles size={14} />
                                    Gerar com IA
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* MODAL DE CONFIRMAÇÃO DE REINICIALIZAÇÃO */}
        {isResetConfirmOpen && (
          <div 
              className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
              onMouseDown={(e) => e.stopPropagation()}
          >
              <div 
                  className="w-[420px] bg-zinc-950 border border-zinc-800 rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-200"
                  onMouseDown={(e) => e.stopPropagation()}
              >
                  <div className="flex flex-col items-center text-center gap-4">
                      <div className="p-3.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">
                          <AlertTriangle size={32} />
                      </div>
                      <h3 className="text-xl font-black text-white uppercase tracking-tighter">Reiniciar Mapa do Zero?</h3>
                      <p className="text-zinc-400 text-sm leading-relaxed">
                          Esta ação irá **apagar permanentemente** todos os nós, conexões e anotações criados por você neste mapa mental.
                      </p>
                      <p className="text-zinc-500 text-xs">
                          O mapa anterior será totalmente excluído do banco de dados para liberar seu espaço de armazenamento. Essa operação não pode ser desfeita.
                      </p>
                      <div className="flex gap-3 w-full mt-4">
                          <button 
                              onClick={() => setIsResetConfirmOpen(false)} 
                              className="flex-1 py-3 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-900 font-bold uppercase text-xs tracking-widest transition-all cursor-pointer"
                          >
                              Cancelar
                          </button>
                          <button 
                              onClick={async () => {
                                  setIsResetConfirmOpen(false);
                                  if (onRestart) {
                                      await onRestart();
                                  }
                              }} 
                              className="flex-1 py-3 rounded-xl bg-red-600 text-white font-black uppercase text-xs tracking-widest hover:bg-red-500 transition-all shadow-lg shadow-red-900/40 cursor-pointer"
                          >
                              Confirmar Reset
                          </button>
                      </div>
                  </div>
              </div>
          </div>
        )}

    </div>
  );
};

export default MindMapFullscreen;