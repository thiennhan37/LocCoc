import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
const cwd=resolve(import.meta.dirname,'../ai-service');
const python=resolve(cwd,process.platform==='win32'?'.venv/Scripts/python.exe':'.venv/bin/python');
if(!existsSync(python)) {
  console.error('Create ai-service/.venv and install ai-service/requirements-dev.txt first.');
  process.exit(1);
}
const args=process.argv.includes('--test')?['-m','pytest','-q']:['-m','uvicorn','app.main:app','--host','127.0.0.1','--port',process.env.PORT??'8087','--no-access-log',...(process.argv.includes('--reload')?['--reload']:[])];
const child=spawn(python,args,{cwd,env:process.env,stdio:'inherit',shell:false});
child.on('error',()=>{console.error('Cannot start Python AI runtime.');process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??1;});
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>{child.kill(signal);});
