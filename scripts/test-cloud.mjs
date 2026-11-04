import assert from 'node:assert/strict';
import {randomBytes,createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createClient} from '@supabase/supabase-js';
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
const base=process.env.FOODLAB_TEST_URL||'http://127.0.0.1:3001';
const url=base+'/supabase',key=env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const client=()=>createClient(url,key,{global:{headers:{Origin:base}},auth:{persistSession:false,autoRefreshToken:false}});
const clients=[],ids=[];const password=randomBytes(22).toString('base64url');
const payload={version:1,profile:{name:'Проверка облака',goal:'Сбалансированное питание',kcal:2200,protein:150,fat:75,carbs:230,mealProtein:45,weeklyServings:12,noPork:true,dislikes:'',allergens:'',spices:'Паприка',budget:5000,maxMinutes:45,difficulty:'Любая',defaultServings:2,equipment:['Сковорода 26 см']},feedback:{},recipes:[],hidden:[],plan:[],consumed:[],pantry:[],shopping:[]};
try{
 assert.equal((await fetch(url+'/auth/v1/health')).status,200);console.log('PASS: Supabase Auth health through application gateway');
 for(let i=0;i<2;i++){const c=client();const email=`foodlab-check-${randomBytes(8).toString('hex')}@example.com`;const {data,error}=await c.auth.signUp({email,password});assert.equal(error,null,'Account creation failed');assert.ok(data.session);ids.push(data.user.id);clients.push({c,email});}
 const a=clients[0].c,b=clients[1].c;
 assert.equal((await a.from('foodlab_states').insert({user_id:ids[0],payload})).error,null);console.log('PASS: authenticated document creation');
 const updated={...payload,profile:{...payload.profile,name:'Сохранено в PostgreSQL'}};
 assert.equal((await a.from('foodlab_states').update({payload:updated}).eq('user_id',ids[0])).error,null);
 const {data:own,error:readError}=await a.from('foodlab_states').select('payload').eq('user_id',ids[0]).single();assert.equal(readError,null);assert.equal(own.payload.profile.name,updated.profile.name);console.log('PASS: document read and update');
 const {data:other,error:otherError}=await b.from('foodlab_states').select('payload').eq('user_id',ids[0]);assert.equal(otherError,null);assert.deepEqual(other,[]);
 assert.ok((await b.from('foodlab_states').upsert({user_id:ids[0],payload})).error);console.log('PASS: RLS blocks another account reading or overwriting the document');
 const anon=client();assert.ok((await anon.from('foodlab_states').select('*')).error);assert.ok((await anon.from('foodlab_states').insert({user_id:ids[0],payload})).error);console.log('PASS: anonymous database access denied');
 assert.equal((await fetch(url+'/auth/v1/admin/users')).status,404);assert.equal((await fetch(url+'/rest/v1/rpc/arbitrary')).status,404);console.log('PASS: admin and arbitrary REST routes are not exposed');assert.equal((await fetch(url+'/auth/v1/token',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'})).status,403);console.log('PASS: cross-site mutation rejected');
 const fresh=client();assert.equal((await fresh.auth.signInWithPassword({email:clients[0].email,password})).error,null);const reloaded=await fresh.from('foodlab_states').select('payload').eq('user_id',ids[0]).single();assert.equal(reloaded.data?.payload.profile.name,updated.profile.name);console.log('PASS: fresh sign-in restores server-side data');
 const beforeRevision=await a.from('foodlab_states').select('revision').eq('user_id',ids[0]).single();
 const expectedRevision=beforeRevision.data.revision;
 const upgraded=await a.from('foodlab_states').update({payload:{...updated,version:2}}).eq('user_id',ids[0]).eq('revision',expectedRevision).select('revision');assert.equal(upgraded.error,null);assert.equal(upgraded.data.length,1);
 const conflict=await a.from('foodlab_states').update({payload:{...updated,version:2}}).eq('user_id',ids[0]).eq('revision',expectedRevision).select('revision');assert.equal(conflict.error,null);assert.deepEqual(conflict.data,[]);console.log('PASS: stale device revision cannot overwrite a newer write');
 assert.ok((await a.from('foodlab_states').update({payload:updated}).eq('user_id',ids[0])).error);console.log('PASS: old data format cannot overwrite upgraded user data');
 const session=(await a.auth.getSession()).data.session;
 const quota=await Promise.all(Array.from({length:20},async()=>{const r=await fetch(env.FOODLAB_SUPABASE_REST_URL+'/rpc/foodlab_reserve_ai_request',{method:'POST',headers:{authorization:'Bearer '+session.access_token,'content-type':'application/json'},body:'{}'});assert.equal(r.status,200);return r.json();}));assert.equal(quota.filter(Boolean).length,10);console.log('PASS: persisted AI quota is atomic under 20 concurrent requests');
 const mainIsolation=await fetch('http://127.0.0.1:3000/supabase/rest/v1/foodlab_states?select=user_id',{headers:{authorization:'Bearer '+session.access_token}});assert.ok([401,403].includes(mainIsolation.status));console.log('PASS: testing access token is not accepted by the stable database');
 assert.equal((await a.from('foodlab_states').delete().eq('user_id',ids[0])).error,null);const deleted=await a.from('foodlab_states').select('payload').eq('user_id',ids[0]);assert.deepEqual(deleted.data,[]);console.log('PASS: document deletion');
 await fresh.auth.signOut();
}finally{
 // Remove only the disposable accounts created by this test. Admin key stays in memory.
 const settings=Object.fromEntries(readFileSync((process.env.FOODLAB_RUNTIME||'/workspace/food-runtime-staging')+'/.env','utf8').trim().split('\n').map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');const unsigned=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role:'service_role',iss:'foodlab-selfhost',exp:Math.floor(Date.now()/1000)+120});const admin=unsigned+'.'+createHmac('sha256',settings.JWT_SECRET).update(unsigned).digest('base64url');
 for(const id of ids){const response=await fetch(env.FOODLAB_SUPABASE_AUTH_URL+'/admin/users/'+id,{method:'DELETE',headers:{Authorization:`Bearer ${admin}`}});assert.ok(response.ok,'Test account cleanup failed');}
 console.log('Disposable test accounts removed.');
}
