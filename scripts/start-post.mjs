import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { postAiEnvironment } from './lib/post-ai-config.mjs';

const root = resolve(import.meta.dirname, '..');
try {
  const env = postAiEnvironment(root);
  const jar = process.argv.includes('--jar');
  const command = jar ? 'java' : (process.platform === 'win32' ? 'mvn.cmd' : 'mvn');
  const args = jar
    ? ['-jar', 'target/post-service-0.0.1-SNAPSHOT.jar']
    : ['spring-boot:run'];
  const child = spawn(command, args, {
    cwd: resolve(root, 'post-service'), env, stdio: 'inherit',
    windowsHide: true, shell: !jar && process.platform === 'win32',
  });
  child.on('error', () => { console.error('Cannot start Post Service. Check Java/Maven installation.'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
