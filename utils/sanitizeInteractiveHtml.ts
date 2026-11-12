/**
 * Sanitizador seguro de HTML para conteúdos interativos (Lei Seca, Blocos, Destaques)
 * Permite apenas tags seguras de formatação e o atributo class para estilização (ex: law-kw, law-caput, law-inciso, law-alinea).
 */

const ALLOWED_TAGS = new Set([
  'p', 'br', 'strong', 'b', 'i', 'em', 'u', 'ul', 'ol', 'li', 'span', 'div', 'mark', 'small', 'sub', 'sup', 'hr'
]);

export function sanitizeInteractiveHtml(rawHtml: string | undefined | null): string {
  if (!rawHtml) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    // Fallback de segurança para SSR/Node: remove scripts e tags perigosas
    return String(rawHtml)
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/on\w+="[^"]*"/gi, '')
      .replace(/on\w+='[^']*'/gi, '');
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');

    const cleanNode = (node: Node) => {
      const childNodes = Array.from(node.childNodes);
      for (const child of childNodes) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const el = child as HTMLElement;
          const tagName = el.tagName.toLowerCase();

          if (!ALLOWED_TAGS.has(tagName)) {
            // Remove o elemento proibido mas preserva seu texto interno se for seguro
            const textNode = doc.createTextNode(el.textContent || '');
            node.replaceChild(textNode, el);
          } else {
            // Limpa atributos proibidos (mantendo apenas class)
            const attrs = Array.from(el.attributes);
            for (const attr of attrs) {
              if (attr.name.toLowerCase() !== 'class') {
                el.removeAttribute(attr.name);
              } else {
                // Sanitiza valor da classe para evitar injeções
                const safeClass = attr.value.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
                el.setAttribute('class', safeClass);
              }
            }
            cleanNode(el);
          }
        } else if (child.nodeType === Node.COMMENT_NODE) {
          node.removeChild(child);
        }
      }
    };

    cleanNode(doc.body);
    return doc.body.innerHTML;
  } catch (error) {
    console.error('Erro na sanitização HTML:', error);
    return String(rawHtml).replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  }
}
