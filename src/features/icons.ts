type IconNode = [string, Record<string, string | number>][];

let set: Promise<Record<string, IconNode>> | null = null;
export const loadIcons = (): Promise<Record<string, IconNode>> => (set ??= import('lucide').then((m) => m.icons as unknown as Record<string, IconNode>));

export const iconLabel = (name: string): string => name.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase();

const esc = (v: string | number): string => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export const iconSvg = (node: IconNode, color: string, size = 24, stroke = 2): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${esc(color)}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${node.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).map(([k, v]) => `${k}="${esc(v)}"`).join(' ')}/>`).join('')}</svg>`;

// Icons go into the document as sharp pictures so every app can show them.
export const iconPng = (svg: string, px = 384): Promise<Blob> => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement('canvas');
    c.width = px; c.height = px;
    c.getContext('2d')!.drawImage(img, 0, 0, px, px);
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('The icon could not be drawn.'))), 'image/png');
  };
  img.onerror = () => reject(new Error('The icon could not be drawn.'));
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
});
