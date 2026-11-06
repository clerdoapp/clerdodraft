import { register } from '../editor/commands';

export const registerProof = (): void => {
  register(
    { id: 'rev.spell', label: 'Spelling and grammar', group: 'Review', keys: 'f7', run: (s) => s.togglePane('proof'), active: (s) => s.view.pane === 'proof' },
    { id: 'rev.proofToggle', label: 'Check while typing', group: 'Review', run: (s) => s.proof?.setEnabled(!s.proof.enabled), active: (s) => !!s.proof?.enabled },
    { id: 'rev.words', label: 'My dictionary', group: 'Review', run: (s) => s.openDialog('words') },
    { id: 'rev.autocorrect', label: 'Typing helpers', group: 'Review', run: (s) => s.openDialog('autocorrect') },
  );
};
