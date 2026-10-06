import type { ProofUpload } from './api';
const LIMIT=5*1024*1024;
const types:Record<string,string>={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'};
export async function prepareGuardianProof(file:File):Promise<ProofUpload>{
 if(!file.size)throw Error('The selected file is empty. Select the saved PDF document.');
 if(file.size>LIMIT)throw Error('Proof must be 5 MB or smaller.');
 // FileReader works in embedded browsers that do not implement File.arrayBuffer.
 const bytes=await new Promise<Uint8Array>((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(Error('Could not read this file. Save it locally and select it again.'));r.onload=()=>resolve(new Uint8Array(r.result as ArrayBuffer));r.readAsArrayBuffer(file);});
 const head=Array.from(bytes.subarray(0,12)).map(x=>String.fromCharCode(x)).join('');
 let fileName=file.name;let ext=fileName.split('.').pop()?.toLowerCase()||'';
 if(!fileName.includes('.')){
  const detected=head.startsWith('%PDF-')?'pdf':bytes[0]===0x89&&head.slice(1,4)==='PNG'?'png':bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff?'jpg':head.startsWith('RIFF')&&head.slice(8,12)==='WEBP'?'webp':'';
  if(!detected)throw Error('This file has no supported extension. Select a PDF, image or Word document.');
  ext=detected;fileName+='.'+ext;
 }
 if(!types[ext])throw Error('Select a PDF, PNG, JPG, WebP or Word document.');
 if(ext==='pdf'&&!head.startsWith('%PDF-'))throw Error('This file is not a readable PDF. Save the actual PDF document and select it again.');
 let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
 return {fileName,fileType:types[ext],fileSize:bytes.length,fileData:btoa(binary)};
}
