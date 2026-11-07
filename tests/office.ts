import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// The other word processor is started with its own settings folder, and once more if its first start fails,
// because a fresh settings folder sometimes makes the first run exit early.
const profile = `file://${mkdtempSync(join(tmpdir(), 'office-profile-'))}`;

export const office = (args: string[]): void => {
  const run = () => execFileSync('soffice', [`-env:UserInstallation=${profile}`, ...args], { stdio: 'ignore', timeout: 120000 });
  try { run(); } catch { run(); }
};

// These checks compare against an outside program; when it can't run on the machine, they are skipped.
export const officeWorks = ((): boolean => {
  try {
    execFileSync('which', ['soffice'], { stdio: 'ignore' });
    const dir = mkdtempSync(join(tmpdir(), 'office-probe-'));
    writeFileSync(join(dir, 'probe.txt'), 'probe');
    office(['--headless', '--convert-to', 'odt', '--outdir', dir, join(dir, 'probe.txt')]);
    return existsSync(join(dir, 'probe.odt'));
  } catch {
    return false;
  }
})();
