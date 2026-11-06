import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
const [major,minor]=process.versions.node.split('.').map(Number);
if(!((major===20&&minor>=19)||(major===22&&minor>=12)||major>22)){
 console.error('请先安装 Node.js 20.19+ 或 22.12+：https://nodejs.org/');
 process.exit(1);
}
const args=process.argv.slice(2),portIndex=args.indexOf('--port');
const port=portIndex<0?5173:Number(args[portIndex+1]);
if(!Number.isInteger(port)||port<0||port>65535){console.error('--port 必须是 0–65535 的整数。');process.exit(1);}
const stamp=path.join(root,'node_modules','.crystal-start-lock');
const hash=createHash('sha256').update(fs.readFileSync('package-lock.json')).digest('hex');
if(!fs.existsSync('node_modules/vite/package.json')||!fs.existsSync(stamp)||fs.readFileSync(stamp,'utf8')!==hash){
 console.log('首次启动或依赖更新：正在安装项目依赖，请稍候（需要网络）…');
 // npm launches Node with its own CLI path; direct double-click launchers use PATH.
 const npmCli=process.env.npm_execpath;
 const result=npmCli?spawnSync(process.execPath,[npmCli,'ci'],{stdio:'inherit'}):spawnSync(process.platform==='win32'?'npm.cmd':'npm',['ci'],{stdio:'inherit',shell:process.platform==='win32'});
 if(result.error||result.status!==0){console.error('依赖安装失败，请检查网络后重新双击启动。',result.error?.message||'');process.exit(1);}
 fs.writeFileSync(stamp,hash);
}
try{
 const {createServer}=await import('vite');
 const server=await createServer({root,server:{host:'127.0.0.1',port,strictPort:false,open:!args.includes('--no-open')}});
 await server.listen();
 console.log(`\n⛷ Crystal Ski 已启动${args.includes('--no-open')?'':'，浏览器会自动打开'}。\n关闭此窗口或按 Ctrl+C 停止本地服务。\n`);
 server.printUrls();
 let stopping=false;
 const stop=async()=>{if(stopping)return;stopping=true;await server.close();process.exit(0);};
 process.on('SIGINT',stop);process.on('SIGTERM',stop);
}catch(error){console.error('启动失败：',error.message);process.exit(1);}
