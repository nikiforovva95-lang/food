import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {randomBytes,createHmac} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
const runtime=process.env.FOODLAB_RUNTIME||'/workspace/food-runtime-staging';
const values=Object.fromEntries(readFileSync(runtime+'/.env','utf8').trim().split('\n').map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
const app=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
const client=createClient((process.env.FOODLAB_TEST_URL||'http://127.0.0.1:3001')+'/supabase',app.FOODLAB_PUBLIC_ANON_KEY||app.NEXT_PUBLIC_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const args=['--host=unix:///var/run/docker.sock','compose','--env-file',runtime+'/.env','-f','supabase/selfhost/compose.yml'];
const db='foodlab_restore_'+randomBytes(6).toString('hex'),marker='backup-check-'+randomBytes(8).toString('hex');let id,created=false;
const run=(command,params)=>execFileSync(command,params,{encoding:'utf8',maxBuffer:10_000_000});
try{
 const account=await client.auth.signUp({email:`${marker}@example.com`,password:randomBytes(24).toString('base64url')});if(account.error||!account.data.user)throw Error('Could not create disposable verification account');id=account.data.user.id;
 const inserted=await client.from('foodlab_states').insert({user_id:id,payload:{version:2,verification:marker}});if(inserted.error)throw Error('Could not save verification marker');
 execFileSync('bash',['scripts/backup-supabase.sh'],{stdio:'inherit',env:{...process.env,FOODLAB_RUNTIME:runtime}});
 const file=readdirSync(runtime+'/backups').filter(n=>n.endsWith('.dump')).map(n=>({n,time:statSync(runtime+'/backups/'+n).mtimeMs})).sort((a,b)=>b.time-a.time)[0];if(!file)throw Error('Backup not found');
 run('docker',[...args,'exec','-T','db','createdb','-U','supabase_admin',db]);created=true;
 const restored=spawnSync('docker',[...args,'exec','-T','db','pg_restore','-U','supabase_admin','--clean','--if-exists','--no-owner','--exit-on-error','-d',db],{input:readFileSync(runtime+'/backups/'+file.n),encoding:'utf8',maxBuffer:10_000_000});
 if(restored.status!==0)throw Error('Restore into isolated database failed; original database was not modified');
 const actual=run('docker',[...args,'exec','-T','db','psql','-U','supabase_admin','-d',db,'-Atc',`select payload->>'verification' from public.foodlab_states where user_id='${id}'`]).trim();if(actual!==marker)throw Error('Restored data did not match original marker');
 const rls=run('docker',[...args,'exec','-T','db','psql','-U','supabase_admin','-d',db,'-Atc',"select relrowsecurity from pg_class where oid='public.foodlab_states'::regclass"]).trim();if(rls!=='t')throw Error('Restored RLS was not enabled');
 console.log('PASS: pg_dump restored into an isolated database; saved document and enabled RLS verified.');
}finally{
 if(created)run('docker',[...args,'exec','-T','db','dropdb','-U','supabase_admin',db]);
 if(id){const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const unsigned=encode({alg:'HS256',typ:'JWT'})+'.'+encode({role:'service_role',exp:Math.floor(Date.now()/1000)+120});const admin=unsigned+'.'+createHmac('sha256',values.JWT_SECRET).update(unsigned).digest('base64url');const result=await fetch(app.FOODLAB_SUPABASE_AUTH_URL+'/admin/users/'+id,{method:'DELETE',headers:{Authorization:'Bearer '+admin}});if(!result.ok)throw Error('Could not remove verification account');}
 console.log('Isolated restore database and disposable account cleaned up.');
}
