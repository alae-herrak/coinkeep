// Publishes the app to GitHub Pages: builds for the repo's sub-path and
// force-pushes the built site to the `gh-pages` branch (GitHub serves that branch).
// Usage: npm run deploy
import { execFileSync, execSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = fileURLToPath(new URL('../dist', import.meta.url));
const git = (args, cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const remote = git(['remote', 'get-url', 'origin']);
const repo = remote.replace(/\.git$/, '').split(/[/:]/).pop();
// A "<user>.github.io" repo is served from the domain root; any other repo from "/<repo>/".
const base = repo.endsWith('.github.io') ? '/' : `/${repo}/`;

console.log(`Building for ${base} …`);
execSync('npm run build', { cwd: root, stdio: 'inherit', env: { ...process.env, BASE_PATH: base } });

// No Jekyll processing: serve the files exactly as built.
writeFileSync(`${dist}/.nojekyll`, '');

console.log('Publishing to the gh-pages branch …');
rmSync(`${dist}/.git`, { recursive: true, force: true });
git(['init', '-q', '-b', 'gh-pages'], dist);
git(['add', '-A'], dist);
git(['commit', '-q', '-m', `Deploy ${new Date().toISOString()}`], dist);
execFileSync('git', ['push', '--force', remote, 'gh-pages'], { cwd: dist, stdio: 'inherit' });
rmSync(`${dist}/.git`, { recursive: true, force: true });

console.log('Done. GitHub takes a minute or two to update the site.');
