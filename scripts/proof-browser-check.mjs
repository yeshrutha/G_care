import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {DATA_DIR} from '../server/config.js';
const file=path.join(DATA_DIR,'verification-proofs','browser-check-'+crypto.randomUUID());
const bytes=Buffer.from('%PDF-1.4\nSynthetic browser proof fixture\n%%EOF');
await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes,{flag:'wx'});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:8080/login');await page.getByRole('tab',{name:'Caretaker',exact:true}).waitFor();
 assert.equal(await page.getByRole('tab',{name:'Nurse / Assistant',exact:true}).count(),0);
 await page.getByRole('button',{name:'Create an account',exact:true}).click();
 const input=page.getByLabel('Upload proof of identity or authorization');await input.setInputFiles({name:'identity.pdf',mimeType:'application/pdf',buffer:bytes});
 await page.getByText('Selected: identity.pdf',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Evidence reference for the reviewer').count(),0);
 await page.screenshot({path:'tmp/postgres/proof-signup.png',fullPage:true});
 const direct=await page.request.get('http://localhost:8080/@fs/'+file.replaceAll('\\','/'));assert.equal(direct.status(),403);
 const relative=await page.request.get('http://localhost:8080/data/verification-proofs/'+path.basename(file));assert.equal(relative.status(),403);
 assert.equal(errors.length,0,errors.join(';'));
 console.log('Browser passed: Caretaker tab, required proof upload, file preview; direct proof access blocked; no account submitted.');
}finally{await browser.close();await fs.unlink(file);}
