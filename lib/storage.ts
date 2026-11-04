'use client';
import {createClient} from '@supabase/supabase-js';
import {useCallback,useEffect,useRef,useState} from 'react';
import {initialState} from './domain';
import {stateSchema} from './validation';
import type {FoodState} from './types';
const proxyPath=process.env.NEXT_PUBLIC_SUPABASE_PROXY_PATH;
const url=proxyPath?`${typeof window==='undefined'?'http://localhost:3000':window.location.origin}${proxyPath}`:process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const passwordAuth=process.env.NEXT_PUBLIC_SUPABASE_AUTH_MODE==='password';
export const supabase=url&&key?createClient(url,key):null;
const localKey='foodlab:v1:local';
function readLocal(){const raw=localStorage.getItem(localKey);return raw?stateSchema.parse(JSON.parse(raw)):initialState();}
export function useFoodState(){
 const [state,setState]=useState<FoodState>(initialState),[ready,setReady]=useState(false),[user,setUser]=useState<string|null>(null),[status,setStatus]=useState('Загрузка…'),[error,setError]=useState('');
 const owner=useRef<string|null>(null),epoch=useRef(0),latest=useRef(state),dirty=useRef(false),queue=useRef<Promise<unknown>>(Promise.resolve());latest.current=state;
 useEffect(()=>{let alive=true;async function load(id:string|null){const e=++epoch.current;setReady(false);owner.current=id;setUser(id);dirty.current=false;try{let next:FoodState;if(id&&supabase){const {data,error}=await supabase.from('foodlab_states').select('payload').eq('user_id',id).maybeSingle();if(error)throw error;next=data?stateSchema.parse(data.payload):initialState();}else next=readLocal();if(alive&&e===epoch.current){setState(next);setStatus(id?'Облако подключено':'Сохранено на устройстве');setReady(true);}}catch(err){if(alive&&e===epoch.current){setError(`Не удалось загрузить данные: ${err instanceof Error?err.message:'проверьте Supabase и схему'}. Запись приостановлена.`);setStatus('Ошибка загрузки');}}}
 void load(null);const {data}=supabase?.auth.onAuthStateChange((event,session)=>{if(event==='TOKEN_REFRESHED'||(event==='SIGNED_IN'&&session?.user.id===owner.current))return;setTimeout(()=>{if(alive)void load(session?.user.id??null);},0);})??{data:null};return()=>{alive=false;epoch.current++;data?.subscription.unsubscribe();};},[]);
 const persist=useCallback(async(value:FoodState,id:string|null,e:number)=>{try{stateSchema.parse(value);if(id&&supabase){const {error}=await supabase.from('foodlab_states').upsert({user_id:id,payload:value,updated_at:new Date().toISOString()});if(error)throw error;}else localStorage.setItem(localKey,JSON.stringify(value));if(e===epoch.current){setStatus(id?'Сохранено в облаке':'Сохранено на устройстве');if(latest.current===value)dirty.current=false;setError('');}return true;}catch(err){if(e===epoch.current){setStatus('Не сохранено');setError(`Ошибка сохранения: ${err instanceof Error?err.message:'хранилище недоступно'}. Скачайте резервную копию.`);}return false;}},[]);
 useEffect(()=>{if(!ready||!dirty.current)return;setStatus('Сохранение…');const id=owner.current,e=epoch.current;const t=setTimeout(()=>{queue.current=queue.current.then(()=>persist(state,id,e));},350);return()=>clearTimeout(t);},[state,ready,persist]);
 useEffect(()=>{function flush(){if(dirty.current&&ready&&!owner.current){try{localStorage.setItem(localKey,JSON.stringify(latest.current));}catch{ /* UI already offers export */ }}}window.addEventListener('pagehide',flush);return()=>window.removeEventListener('pagehide',flush);},[ready]);
 const update=useCallback((change:(s:FoodState)=>FoodState)=>{setState(old=>{const next=stateSchema.parse(change(old));dirty.current=true;return next;});},[]);
 const saveNow=async()=>{await queue.current;return await persist(latest.current,owner.current,epoch.current);};
 const recoverLocal=()=>{if(owner.current)return;try{const raw=localStorage.getItem(localKey);if(raw)localStorage.setItem(`${localKey}:recovery:${Date.now()}`,raw);dirty.current=true;setState(initialState());setError('');setReady(true);}catch{setError('Не удалось создать резервную копию повреждённых данных. Освободите место в браузере.');}};
 return {state,update,ready,user,status,error,setError,saveNow,recoverLocal};
}
