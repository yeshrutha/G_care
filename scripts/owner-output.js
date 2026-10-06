import {copyFile} from 'node:fs/promises';
await copyFile('owner-dist/owner.html','owner-dist/index.html');
console.log('Separate owner website generated in owner-dist.');
