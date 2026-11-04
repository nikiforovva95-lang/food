import {randomBytes,createHmac} from 'node:crypto';
import {mkdirSync,existsSync,writeFileSync,readFileSync,chmodSync} from 'node:fs';
import path from 'node:path';
const root=process.cwd();const dir=process.env.FOODLAB_RUNTIME||'/workspace/food-runtime';
mkdirSync(dir,{recursive:true,mode:0o700});chmodSync(dir,0o700);
mkdirSync(path.join(dir,'db-config'),{recursive:true});
const config=path.join(dir,'.env');
if(!existsSync(config)){
 if(existsSync(path.join(dir,'data','PG_VERSION')))throw Error('Existing database without its credential file: restore runtime .env from backup.');
 writeFileSync(config,`FOODLAB_RUNTIME=${dir}\nPOSTGRES_PASSWORD=${randomBytes(32).toString('hex')}\nJWT_SECRET=${randomBytes(48).toString('hex')}\n`,{mode:0o600,flag:'wx'});
}
const values=Object.fromEntries(readFileSync(config,'utf8').trim().split('\n').map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const payload={role:'anon',iss:'foodlab-selfhost',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+10*365*86400};const unsigned=encode({alg:'HS256',typ:'JWT'})+'.'+encode(payload);const anon=unsigned+'.'+createHmac('sha256',values.JWT_SECRET).update(unsigned).digest('base64url');
const envFile=path.join(root,'.env.local');const marker='# FoodLab managed self-hosted configuration';
if(existsSync(envFile)&&!readFileSync(envFile,'utf8').startsWith(marker))throw Error('Existing .env.local is not managed by this script. It was preserved; configure self-hosting manually.');
writeFileSync(envFile,`${marker}\nNEXT_PUBLIC_SUPABASE_PROXY_PATH=/supabase\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}\nNEXT_PUBLIC_SUPABASE_AUTH_MODE=password\nFOODLAB_SUPABASE_AUTH_URL=http://127.0.0.1:54331\nFOODLAB_SUPABASE_REST_URL=http://127.0.0.1:54332\n`,{mode:0o600});
console.log('Self-hosted runtime configured. Private credentials remain in the protected runtime directory.');
