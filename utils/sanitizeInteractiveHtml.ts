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
            // Limpa atributos proibidos (mantendo apenas class e style tipográfico seguro)
            const attrs = Array.from(el.attributes);
            for (const attr of attrs) {
              const attrName = attr.name.toLowerCase();
              if (attrName === 'class') {
                // Sanitiza valor da classe para evitar injeções
                const safeClass = attr.value.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim();
                if (safeClass) {
                  el.setAttribute('class', safeClass);
                } else {
                  el.removeAttribute('class');
                }
              } else if (attrName === 'style') {
                // Permite apenas propriedades tipográficas estritamente seguras (color e font-weight)
                const safeDeclarations: string[] = [];
                const declarations = attr.value.split(';');
                for (const decl of declarations) {
                  const colonIdx = decl.indexOf(':');
                  if (colonIdx === -1) continue;
                  const prop = decl.slice(0, colonIdx).trim().toLowerCase();
                  const val = decl.slice(colonIdx + 1).trim();
                  if (
                    prop === 'color' &&
                    /^(#[0-9a-fA-F]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(?:\s*,\s*(?:0|1|0?\.\d+))?\s*\))$/.test(val)
                  ) {
                    safeDeclarations.push(`color: ${val}`);
                  } else if (prop === 'font-weight' && /^(bold|normal|bolder|[1-9]00)$/i.test(val)) {
                    safeDeclarations.push(`font-weight: ${val.toLowerCase()}`);
                  }
                }
                if (safeDeclarations.length > 0) {
                  el.setAttribute('style', `${safeDeclarations.join('; ')};`);
                } else {
                  el.removeAttribute('style');
                }
              } else {
                el.removeAttribute(attr.name);
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
