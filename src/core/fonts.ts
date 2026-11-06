import catalog from './font-catalog.json';

// Font names documents commonly use, each drawn with an open font of similar shape.
// The main office fonts use fonts with the same character widths, so lines and pages break alike.
// A font installed on the computer is always used first.
const LOOKALIKE: Record<string, string> = {
  // Same widths
  calibri: 'Carlito', 'calibri light': 'Carlito', cambria: 'Caladea', 'cambria math': 'Caladea',
  arial: 'Arimo', helvetica: 'Arimo', 'helvetica neue': 'Arimo', 'times new roman': 'Tinos', times: 'Tinos',
  'courier new': 'Cousine', courier: 'Cousine', georgia: 'Gelasio', 'georgia pro': 'Gelasio',
  // Similar shape
  aptos: 'Inter', 'aptos display': 'Inter', 'aptos narrow': 'Roboto Condensed', 'aptos light': 'Inter', 'aptos semibold': 'Inter', 'aptos black': 'Inter', 'aptos extrabold': 'Inter',
  'aptos serif': 'Source Serif 4', 'aptos mono': 'IBM Plex Mono',
  'arial black': 'Archivo Black', 'arial narrow': 'Archivo Narrow', 'arial nova': 'Arimo', 'arial rounded mt bold': 'Varela Round', 'arial unicode ms': 'Noto Sans',
  bahnschrift: 'Barlow', bierstadt: 'Public Sans', candara: 'Cabin', 'century gothic': 'Didact Gothic', corbel: 'Open Sans',
  'franklin gothic book': 'Libre Franklin', 'franklin gothic demi': 'Libre Franklin', 'franklin gothic medium': 'Libre Franklin',
  'gill sans mt': 'Lato', 'gill sans nova': 'Lato', grandview: 'Lexend', 'lucida sans': 'Open Sans', 'lucida sans unicode': 'Open Sans',
  'microsoft sans serif': 'Arimo', 'segoe ui': 'Noto Sans', 'segoe ui light': 'Noto Sans', 'segoe ui semibold': 'Noto Sans', 'segoe ui black': 'Noto Sans',
  'segoe ui historic': 'Noto Sans', seaford: 'Figtree', tahoma: 'Noto Sans', tenorite: 'Nunito Sans', 'trebuchet ms': 'Fira Sans', 'tw cen mt': 'Jost',
  verdana: 'Noto Sans', 'verdana pro': 'Noto Sans', 'avenir next lt pro': 'Nunito Sans', abadi: 'Open Sans', univers: 'Roboto', 'neue haas grotesk text pro': 'Inter',
  posterama: 'League Spartan', biome: 'Outfit', daytona: 'Manrope', dubai: 'Cairo', 'agency fb': 'Pathway Gothic One', 'berlin sans fb': 'Fredoka',
  gadugi: 'Noto Sans', ebrima: 'Noto Sans', 'nirmala ui': 'Noto Sans Devanagari', 'leelawadee ui': 'Noto Sans Thai', leelawadee: 'Noto Sans Thai',
  'bell mt': 'Libre Caslon Text', 'bodoni mt': 'Bodoni Moda', 'book antiqua': 'Domine', 'bookman old style': 'Bitter', 'californian fb': 'Sorts Mill Goudy',
  centaur: 'Cormorant', century: 'Old Standard TT', 'century schoolbook': 'Old Standard TT', constantia: 'Crimson Pro', garamond: 'EB Garamond',
  'goudy old style': 'Sorts Mill Goudy', 'high tower text': 'Linden Hill', 'palatino linotype': 'Domine', palatino: 'Domine', perpetua: 'Cormorant Garamond',
  rockwell: 'Arvo', 'rockwell nova': 'Arvo', 'sitka text': 'Spectral', 'sitka heading': 'Spectral', 'sitka small': 'Spectral', 'baskerville old face': 'Libre Baskerville',
  baskerville: 'Libre Baskerville', bembo: 'Cardo', elephant: 'Ultra', 'footlight mt light': 'Radley', 'modern no. 20': 'GFS Didot', sylfaen: 'Noto Serif',
  walbaum: 'Libre Bodoni', 'calisto mt': 'Rasa', 'lucida bright': 'Merriweather', 'lucida fax': 'Merriweather', 'segoe ui variable': 'Noto Sans',
  consolas: 'Inconsolata', 'lucida console': 'Cousine', 'lucida sans typewriter': 'Space Mono', 'cascadia code': 'JetBrains Mono', 'cascadia mono': 'JetBrains Mono', 'ocr a extended': 'Space Mono',
  'bradley hand itc': 'Gochi Hand', 'brush script mt': 'Yellowtail', 'comic sans ms': 'Comic Neue', 'edwardian script itc': 'Pinyon Script', 'freestyle script': 'Sacramento',
  'french script mt': 'Parisienne', gabriola: 'Italianno', 'ink free': 'Caveat', 'kristen itc': 'Coming Soon', 'lucida handwriting': 'Merienda', mistral: 'Kalam',
  'monotype corsiva': 'Tangerine', 'segoe print': 'Patrick Hand', 'segoe script': 'Satisfy', 'script mt bold': 'Cookie', 'vladimir script': 'Alex Brush',
  'viner hand itc': 'Nothing You Could Do', 'juice itc': 'Neucha', chiller: 'Creepster', 'curlz mt': 'Spicy Rice', jokerman: 'Fascinate', papyrus: 'Uncial Antiqua',
  'blackadder itc': 'UnifrakturMaguntia', harrington: 'Cinzel Decorative', 'old english text mt': 'UnifrakturMaguntia', algerian: 'Cinzel Decorative', impact: 'Anton',
  'showcard gothic': 'Bowlby One SC', stencil: 'Black Ops One', 'snap itc': 'Chewy', ravie: 'Luckiest Guy', broadway: 'Limelight', 'cooper black': 'Cooper Black',
  'bauhaus 93': 'Righteous', 'britannic bold': 'Carter One', castellar: 'Cinzel', 'copperplate gothic bold': 'Cinzel', 'engravers mt': 'Cinzel', 'felix titling': 'Cinzel',
  haettenschweiler: 'Oswald', magneto: 'Lobster', 'matura mt script capitals': 'Playball', 'niagara solid': 'Yanone Kaffeesatz', playbill: 'Rye', 'poor richard': 'Coustard',
  'rage italic': 'Allura', 'wide latin': 'Ultra', forte: 'Pacifico', gigi: 'Great Vibes', 'kunstler script': 'Pinyon Script', parchment: 'Italianno', pristina: 'Homemade Apple',
  'tempus sans itc': 'Short Stack', 'goudy stout': 'Ultra', 'gloucester mt extra condensed': 'Fjalla One', onyx: 'Saira Condensed',
  // Arabic, Hebrew and other scripts
  'arabic typesetting': 'Scheherazade New', 'simplified arabic': 'Noto Naskh Arabic', 'simplified arabic fixed': 'Noto Naskh Arabic', 'traditional arabic': 'Amiri',
  'sakkal majalla': 'Lateef', andalus: 'Reem Kufi', aldhabi: 'Aref Ruqaa', 'urdu typesetting': 'Lateef', 'microsoft uighur': 'Harmattan', 'arabic transparent': 'Noto Naskh Arabic',
  david: 'Frank Ruhl Libre', miriam: 'Heebo', frankruehl: 'Frank Ruhl Libre', gisha: 'Assistant', narkisim: 'Heebo', 'levenim mt': 'Heebo', aharoni: 'Heebo', rod: 'Noto Sans Hebrew',
  mangal: 'Noto Sans Devanagari', kokila: 'Martel', aparajita: 'Martel', utsaah: 'Noto Sans Devanagari',
  'angsana new': 'Sarabun', 'cordia new': 'Sarabun', 'browallia new': 'Kanit', 'angsanaupc': 'Sarabun', 'cordiaupc': 'Sarabun',
  // Symbol fonts: their letters are turned into the matching characters
  symbol: 'Noto Sans Symbols', wingdings: 'Noto Sans Symbols 2', 'wingdings 2': 'Noto Sans Symbols 2', 'wingdings 3': 'Noto Sans Symbols 2', webdings: 'Noto Sans Symbols 2',
  'segoe ui symbol': 'Noto Sans Symbols 2', 'segoe ui emoji': 'Noto Sans Symbols 2', 'mt extra': 'Noto Sans Symbols',
};

// East Asian fonts are large, so the system's own fonts for those languages are used.
const SYSTEM_CJK: Record<string, string> = {
  'ms gothic': 'sans-serif', 'ms pgothic': 'sans-serif', 'ms mincho': 'serif', 'ms pmincho': 'serif', meiryo: 'sans-serif', 'meiryo ui': 'sans-serif',
  'yu gothic': 'sans-serif', 'yu gothic ui': 'sans-serif', 'yu mincho': 'serif', simsun: 'serif', nsimsun: 'serif', simhei: 'sans-serif', 'microsoft yahei': 'sans-serif',
  dengxian: 'sans-serif', kaiti: 'serif', fangsong: 'serif', 'microsoft jhenghei': 'sans-serif', pmingliu: 'serif', mingliu: 'serif', 'malgun gothic': 'sans-serif',
  batang: 'serif', gulim: 'sans-serif', dotum: 'sans-serif', gungsuh: 'serif',
};

const DISPLAY_NAME: Record<string, string> = Object.fromEntries([...Object.keys(LOOKALIKE), ...Object.keys(SYSTEM_CJK)].map((k) => [k, titleCase(k)]));

function titleCase(k: string): string {
  const fixed: Record<string, string> = { 'ms gothic': 'MS Gothic', 'ms pgothic': 'MS PGothic', 'ms mincho': 'MS Mincho', 'ms pmincho': 'MS PMincho', 'mt extra': 'MT Extra', 'ocr a extended': 'OCR A Extended', 'segoe ui': 'Segoe UI', 'nirmala ui': 'Nirmala UI', 'leelawadee ui': 'Leelawadee UI', 'yu gothic ui': 'Yu Gothic UI', 'meiryo ui': 'Meiryo UI', 'microsoft yahei': 'Microsoft YaHei', 'microsoft jhenghei': 'Microsoft JhengHei', pmingliu: 'PMingLiU', mingliu: 'MingLiU', simsun: 'SimSun', nsimsun: 'NSimSun', simhei: 'SimHei', dengxian: 'DengXian', kaiti: 'KaiTi', fangsong: 'FangSong', frankruehl: 'FrankRuehl', angsanaupc: 'AngsanaUPC', cordiaupc: 'CordiaUPC', 'trebuchet ms': 'Trebuchet MS', 'comic sans ms': 'Comic Sans MS', 'tw cen mt': 'Tw Cen MT', 'gill sans mt': 'Gill Sans MT', 'bell mt': 'Bell MT', 'bodoni mt': 'Bodoni MT', 'brush script mt': 'Brush Script MT', 'calisto mt': 'Calisto MT', 'californian fb': 'Californian FB', 'agency fb': 'Agency FB', 'berlin sans fb': 'Berlin Sans FB', 'bradley hand itc': 'Bradley Hand ITC', 'edwardian script itc': 'Edwardian Script ITC', 'french script mt': 'French Script MT', 'kristen itc': 'Kristen ITC', 'script mt bold': 'Script MT Bold', 'viner hand itc': 'Viner Hand ITC', 'vladimir script': 'Vladimir Script', 'juice itc': 'Juice ITC', 'blackadder itc': 'Blackadder ITC', 'old english text mt': 'Old English Text MT', 'snap itc': 'Snap ITC', 'engravers mt': 'Engravers MT', 'matura mt script capitals': 'Matura MT Script Capitals', 'tempus sans itc': 'Tempus Sans ITC', 'gloucester mt extra condensed': 'Gloucester MT Extra Condensed', 'levenim mt': 'Levenim MT', 'footlight mt light': 'Footlight MT Light', 'arial rounded mt bold': 'Arial Rounded MT Bold', 'avenir next lt pro': 'Avenir Next LT Pro', 'modern no. 20': 'Modern No. 20', 'microsoft uighur': 'Microsoft Uighur', 'microsoft sans serif': 'Microsoft Sans Serif', 'segoe ui light': 'Segoe UI Light', 'segoe ui semibold': 'Segoe UI Semibold', 'segoe ui black': 'Segoe UI Black', 'segoe ui historic': 'Segoe UI Historic', 'segoe ui symbol': 'Segoe UI Symbol', 'segoe ui emoji': 'Segoe UI Emoji', 'segoe ui variable': 'Segoe UI Variable' };
  return fixed[k] ?? k.replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface FontEntry { name: string; category: string; lookalike?: string }

const OPEN: FontEntry[] = (catalog as { family: string; category: string }[]).map((f) => ({ name: f.family, category: f.category }));
const openNames = new Set(OPEN.map((f) => f.name.toLowerCase()));

const categoryOf = (sub: string): string => OPEN.find((f) => f.name === sub)?.category ?? 'sans-serif';

export const DOCUMENT_FONTS: FontEntry[] = Object.keys(DISPLAY_NAME)
  .filter((k) => !openNames.has(k))
  .map((k) => ({ name: DISPLAY_NAME[k]!, category: LOOKALIKE[k] ? categoryOf(LOOKALIKE[k]!) : SYSTEM_CJK[k] === 'serif' ? 'serif' : 'sans-serif', lookalike: LOOKALIKE[k] }));

export const ALL_FONTS: FontEntry[] = [...DOCUMENT_FONTS, ...OPEN].sort((a, b) => a.name.localeCompare(b.name));

let installed = new Set<string>();
export const setInstalledFonts = (names: string[]): void => { installed = new Set(names.map((n) => n.toLowerCase())); };
export const installedFonts = (): Set<string> => installed;

export const lookalikeOf = (name: string): string | undefined => {
  const k = name.toLowerCase();
  if (installed.has(k) || openNames.has(k)) return undefined;
  return LOOKALIKE[k];
};

const FALLBACK = '"Noto Naskh Arabic", "Noto Sans Hebrew", "Noto Sans Symbols 2", "Carlito"';

export const cssFamily = (name: string): string => {
  const k = name.toLowerCase();
  const clean = `"${name.replaceAll('"', '')}"`;
  if (installed.has(k) || openNames.has(k)) return `${clean}, ${FALLBACK}, sans-serif`;
  const look = LOOKALIKE[k];
  if (look) return `${clean}, "${look}", ${FALLBACK}, sans-serif`;
  const cjk = SYSTEM_CJK[k];
  if (cjk) return `${clean}, ${cjk}`;
  return `${clean}, ${FALLBACK}, sans-serif`;
};

// Symbol and dingbat fonts store letters that stand for other characters.
const SYMBOL: Record<number, string> = {
  0x22: '∀', 0x24: '∃', 0x27: '∋', 0x2a: '∗', 0x2d: '−', 0x40: '≅', 0x5c: '∴', 0x5e: '⊥', 0x60: '‾',
  0xa1: 'ϒ', 0xa2: '′', 0xa3: '≤', 0xa4: '⁄', 0xa5: '∞', 0xa6: 'ƒ', 0xa7: '♣', 0xa8: '♦', 0xa9: '♥', 0xaa: '♠', 0xab: '↔', 0xac: '←', 0xad: '↑', 0xae: '→', 0xaf: '↓',
  0xb0: '°', 0xb1: '±', 0xb2: '″', 0xb3: '≥', 0xb4: '×', 0xb5: '∝', 0xb6: '∂', 0xb7: '•', 0xb8: '÷', 0xb9: '≠', 0xba: '≡', 0xbb: '≈', 0xbc: '…', 0xbd: '⏐', 0xbe: '⎯', 0xbf: '↵',
  0xc0: 'ℵ', 0xc1: 'ℑ', 0xc2: 'ℜ', 0xc3: '℘', 0xc4: '⊗', 0xc5: '⊕', 0xc6: '∅', 0xc7: '∩', 0xc8: '∪', 0xc9: '⊃', 0xca: '⊇', 0xcb: '⊄', 0xcc: '⊂', 0xcd: '⊆', 0xce: '∈', 0xcf: '∉',
  0xd0: '∠', 0xd1: '∇', 0xd2: '®', 0xd3: '©', 0xd4: '™', 0xd5: '∏', 0xd6: '√', 0xd7: '⋅', 0xd8: '¬', 0xd9: '∧', 0xda: '∨', 0xdb: '⇔', 0xdc: '⇐', 0xdd: '⇑', 0xde: '⇒', 0xdf: '⇓',
  0xe0: '◊', 0xe1: '〈', 0xe2: '®', 0xe3: '©', 0xe4: '™', 0xe5: '∑', 0xf1: '〉', 0xf2: '∫',
};
const GREEK_UP = 'ΑΒΧΔΕΦΓΗΙϑΚΛΜΝΟΠΘΡΣΤΥςΩΞΨΖ';
const GREEK_LOW = 'αβχδεφγηιϕκλμνοπθρστυϖωξψζ';
for (let i = 0; i < 26; i++) { SYMBOL[0x41 + i] = GREEK_UP[i]!; SYMBOL[0x61 + i] = GREEK_LOW[i]!; }

const WINGDINGS: Record<number, string> = {
  0x21: '✏', 0x22: '✂', 0x23: '✁', 0x28: '☎', 0x29: '✆', 0x2a: '✉', 0x36: '⌛', 0x37: '⌨', 0x3e: '✇', 0x3f: '✍', 0x41: '✌', 0x45: '☜', 0x46: '☞', 0x47: '☝', 0x48: '☟',
  0x4a: '☺', 0x4b: '😐', 0x4c: '☹', 0x4d: '💣', 0x4e: '☠', 0x4f: '⚐', 0x51: '✈', 0x52: '☼', 0x54: '❄', 0x56: '✞', 0x58: '✠', 0x59: '✡', 0x5a: '☪', 0x5b: '☯', 0x5c: 'ॐ', 0x5d: '☸',
  0x5e: '♈', 0x5f: '♉', 0x60: '♊', 0x61: '♋', 0x62: '♌', 0x63: '♍', 0x64: '♎', 0x65: '♏', 0x66: '♐', 0x67: '♑', 0x68: '♒', 0x69: '♓', 0x6a: '🙰', 0x6b: '🙵',
  0x6c: '●', 0x6d: '❍', 0x6e: '■', 0x6f: '□', 0x70: '◻', 0x71: '❑', 0x72: '❒', 0x73: '⬧', 0x74: '⧫', 0x75: '◆', 0x76: '❖', 0x77: '⬥', 0x78: '⌧', 0x79: '⍓', 0x7a: '⌘', 0x7b: '❀', 0x7c: '✿', 0x7d: '❝', 0x7e: '❞',
  0x9f: '•', 0xa0: '▫', 0xa1: '○', 0xa2: '⭕', 0xa4: '◉', 0xa5: '◎', 0xa7: '▪', 0xa8: '◻', 0xaa: '✦', 0xab: '★', 0xac: '✶', 0xad: '✴', 0xae: '✹', 0xaf: '✵', 0xb1: '⌖', 0xb2: '⟡', 0xb3: '⌑',
  0xd5: '⌫', 0xd6: '⌦', 0xd8: '➢', 0xdf: '🡐', 0xe0: '🡒', 0xe1: '🡑', 0xe2: '🡓', 0xe8: '➔', 0xef: '⇦', 0xf0: '⇨', 0xf1: '⇧', 0xf2: '⇩', 0xf3: '⬄', 0xf4: '⇳',
  0xfb: '✗', 0xfc: '✓', 0xfd: '☒', 0xfe: '☑',
};
const WINGDINGS2: Record<number, string> = { 0x4f: '✗', 0x50: '✔', 0x51: '☒', 0x52: '☑', 0x53: '☒', 0x54: '☒', 0x97: '●', 0x98: '●', 0xa2: '■', 0xa3: '□', 0xf3: '★', 0xf8: '◆' };
const WINGDINGS3: Record<number, string> = { 0x5b: '◀', 0x5c: '▶', 0x5d: '▲', 0x5e: '▼', 0x70: '△', 0x71: '▽', 0x75: '◀', 0x76: '▶', 0xc6: '➔', 0xd7: '◄', 0xd8: '►', 0xd9: '▲', 0xda: '▼' };

const TABLES: Record<string, Record<number, string>> = { symbol: SYMBOL, wingdings: WINGDINGS, 'wingdings 2': WINGDINGS2, 'wingdings 3': WINGDINGS3 };

export const isSymbolFont = (font?: string): boolean => !!font && font.toLowerCase() in TABLES;

// One character in, one character out, so text positions stay the same.
export const symbolChar = (font: string | undefined, ch: string): string => {
  const t = font ? TABLES[font.toLowerCase()] : undefined;
  if (!t) return ch;
  let code = ch.charCodeAt(0);
  if (code >= 0xf000 && code <= 0xf0ff) code -= 0xf000;
  const out = t[code];
  return out && out.length === 1 ? out : ch;
};

export const symbolText = (font: string | undefined, text: string): string => (isSymbolFont(font) ? [...text].map((c) => symbolChar(font, c)).join('') : text);
