import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {feedConfigured,priceRuntime,refreshPriceFeed} from '../lib/server/price-feed.ts';
if(!feedConfigured()){console.error('Price worker is not started: no real source is configured.');process.exit(2);}
const once=process.argv.includes('--once');
const interval=Math.max(60,Number(process.env.FOODLAB_PRICE_REFRESH_SECONDS||21600))*1000;
let status={heartbeatAt:new Date().toISOString(),lastSuccess:null,nextRun:null,lastError:null};
async function heartbeat(){status.heartbeatAt=new Date().toISOString();await mkdir(priceRuntime(),{recursive:true,mode:0o700});await writeFile(path.join(priceRuntime(),'price-worker.json'),JSON.stringify(status),{mode:0o600});}
const timer=setInterval(()=>void heartbeat().catch(()=>{}),60000);
try{do{try{await refreshPriceFeed();status.lastSuccess=new Date().toISOString();status.lastError=null;console.log('Price source refreshed and validated.');}catch{status.lastError='Источник не обновлён. Последние успешные данные сохранены.';console.error(status.lastError);if(once)process.exitCode=1;}status.nextRun=once?null:new Date(Date.now()+interval).toISOString();await heartbeat();if(!once)await new Promise(resolve=>setTimeout(resolve,interval));}while(!once);}finally{clearInterval(timer);}
