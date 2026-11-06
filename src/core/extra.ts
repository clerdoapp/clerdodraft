import type { Block, Paragraph } from './model';
import { paraText, walkParagraphs } from './tree';

export { flatten, isCollapsed, orderedSel, storyBlocks, updatePara } from './tree';

export const walkAll = (blocks: Block[]): Generator<Paragraph> => walkParagraphs(blocks);

export const headingOf = (p: Paragraph): string => paraText(p).replaceAll('\t', ' ').replaceAll('\n', ' ').replaceAll('\f', '');
