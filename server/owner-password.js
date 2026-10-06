// Enter the password interactively; never pass it as a command-line argument.
import {readFile,writeFile} from 'node:fs/promises';
import { hashPassword } from './auth.js';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
const output=new Writable({write(chunk,encoding,callback){if(!output.muted)process.stdout.write(chunk);callback();}});
const input=createInterface({input:process.stdin,output,terminal:true});
try {
 process.stdout.write('Choose owner password (at least 12 characters): ');output.muted=true;
 const password=await input.question('');output.muted=false;process.stdout.write('\n');
 if(password.length<12)throw Error('Use at least 12 characters.');
 const hash=await hashPassword(password);
 let env=await readFile('.env','utf8').catch(()=> '');
 for(const [key,value] of Object.entries({OWNER_PASSWORD_HASH:hash,OWNER_LOCAL_ENABLED:'true'})){const pattern=new RegExp('^'+key+'=.*$','gm');env=pattern.test(env)?env.replace(pattern,key+'='+value):env+'\n'+key+'='+value+'\n';}
 await writeFile('.env',env,{mode:0o600});
 console.log('Owner password saved privately in local .env. Restart the local backend to sign in.');
} finally {input.close();}
