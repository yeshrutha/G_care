// Enter the password interactively; never pass it as a command-line argument.
import { hashPassword } from './auth.js';
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
const output=new Writable({write(chunk,encoding,callback){if(!output.muted)process.stdout.write(chunk);callback();}});
const input=createInterface({input:process.stdin,output,terminal:true});
try {
 process.stdout.write('Choose owner password (at least 12 characters): ');output.muted=true;
 const password=await input.question('');output.muted=false;process.stdout.write('\n');
 if(password.length<12)throw Error('Use at least 12 characters.');
 console.log('Set OWNER_PASSWORD_HASH privately on the backend to this value:');console.log(await hashPassword(password));
} finally {input.close();}
