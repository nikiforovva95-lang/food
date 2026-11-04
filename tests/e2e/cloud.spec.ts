import {test,expect,Page} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
import {randomBytes,createHmac} from 'node:crypto';
const runtime=process.env.FOODLAB_RUNTIME||'/workspace/food-runtime';
const configured=existsSync(`${runtime}/.env`)&&existsSync('.env.local')&&readFileSync('.env.local','utf8').includes('NEXT_PUBLIC_SUPABASE_AUTH_MODE=password');
async function profile(page:Page){if(await page.getByRole('button',{name:'Открыть меню',exact:true}).isVisible())await page.getByRole('button',{name:'Открыть меню',exact:true}).click();await page.getByRole('navigation').getByRole('button',{name:'Профиль и настройки',exact:true}).click();}
test('Supabase: регистрация, сохранение, новое устройство и выход',async({page,browser})=>{
 test.skip(!configured,'Self-hosted Supabase is not configured in this environment');
 const email=`foodlab-browser-${randomBytes(8).toString('hex')}@example.com`,password=randomBytes(20).toString('base64url');let id:string|undefined;let second:Awaited<ReturnType<typeof browser.newContext>>|undefined;
 try{
  await page.goto('/');await expect(page.getByText('Меньше думать о еде.')).toBeVisible();await profile(page);
  await page.getByLabel('Как вас зовут').fill('Локальный профиль');await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('foodlab:v1:local')||'{}').profile?.name)).toBe('Локальный профиль');
  await page.getByRole('button',{name:'Зарегистрироваться',exact:true}).click();await page.getByLabel('Электронная почта',{exact:true}).fill(email);await page.getByLabel('Пароль',{exact:true}).fill(password);
  const response=page.waitForResponse(r=>r.url().includes('/auth/v1/signup'));
  await page.getByRole('button',{name:'Создать аккаунт',exact:true}).click();const registered=await response;const data=await registered.json();id=data.user?.id;expect(registered.status()).toBe(200);expect(id).toBeTruthy();
  await expect(page.getByText('Аккаунт подключён',{exact:true})).toBeVisible();await expect(page.getByLabel('Как вас зовут')).toHaveValue('Виталий');
  await page.getByLabel('Как вас зовут').fill('Облачный пользователь');await expect(page.getByText('Сохранено в облаке',{exact:true})).toBeVisible();
  await page.reload();await profile(page);await expect(page.getByLabel('Как вас зовут')).toHaveValue('Облачный пользователь');
  second=await browser.newContext();const other=await second.newPage();await other.goto('/');await expect(other.getByText('Меньше думать о еде.')).toBeVisible();await profile(other);await other.getByLabel('Электронная почта',{exact:true}).fill(email);await other.getByLabel('Пароль',{exact:true}).fill(password);await other.getByRole('button',{name:'Войти',exact:true}).click();await expect(other.getByText('Аккаунт подключён',{exact:true})).toBeVisible();await expect(other.getByLabel('Как вас зовут')).toHaveValue('Облачный пользователь');
  await page.getByRole('button',{name:'Выйти',exact:true}).click();await expect(page.getByLabel('Как вас зовут')).toHaveValue('Локальный профиль');
 }finally{
  await second?.close();
  if(id){const values=Object.fromEntries(readFileSync(`${runtime}/.env`,'utf8').trim().split('\n').map(l=>{const i=l.indexOf('=');return [l.slice(0,i),l.slice(i+1)];}));const enc=(x:unknown)=>Buffer.from(JSON.stringify(x)).toString('base64url');const data=enc({alg:'HS256',typ:'JWT'})+'.'+enc({role:'service_role',exp:Math.floor(Date.now()/1000)+120});const admin=data+'.'+createHmac('sha256',values.JWT_SECRET).update(data).digest('base64url');const deleted=await fetch(`http://127.0.0.1:54331/admin/users/${id}`,{method:'DELETE',headers:{Authorization:`Bearer ${admin}`}});expect(deleted.ok).toBe(true);}
 }
});
