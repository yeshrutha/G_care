import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { dbService,closeDb } from '../server/db.js';
const browser=await chromium.launch({headless:true});const results=[];
try {
 for(const [id,route,count] of [['user-demo-doctor','/doctor',3],['user-demo-caretaker','/dashboard',3],['user-demo-guardian','/guardian/dashboard',1]]) {
  const user=await dbService.findUserById(id);const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const login=await context.request.post('http://localhost:8080/api/auth/login',{data:{email:user.email,password:'Demo1234!',role:user.role}});assert.equal(login.status(),200);const session=await login.json();
  await context.addInitScript(({token,user})=>{sessionStorage.setItem('gcare_auth_token',token);sessionStorage.setItem('gcare_auth_user',JSON.stringify(user));},{token:session.token,user:session.user});
  await page.goto('http://localhost:8080'+route);await page.getByText('Usha',{exact:true}).first().waitFor({timeout:15000});
  const dashboard=await page.request.get('http://localhost:8080/api/dashboard-data',{headers:{Authorization:'Bearer '+session.token}});assert.equal((await dashboard.json()).elders.length,count);
  await page.reload();await page.getByText('Usha',{exact:true}).first().waitFor({timeout:15000});assert.equal(errors.length,0,errors.join('; '));
  if(user.role==='guardian'){await page.getByRole('button',{name:'Watch Simulator',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByText('Usha',{exact:true}).first().waitFor({timeout:15000});assert.ok(!(await dialog.innerText()).includes('Venkatesh Rao'));await page.screenshot({path:'tmp/postgres/watch-postgres.png',fullPage:true});}
  await page.screenshot({path:'tmp/postgres/'+user.role+'-postgres.png',fullPage:true});results.push({role:user.role,patients:count,reload:'passed',pageErrors:errors.length});await context.close();
 }
 console.log(JSON.stringify(results));
} finally {await browser.close();await closeDb();}
