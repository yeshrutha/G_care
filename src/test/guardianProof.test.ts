import {describe,it,expect} from 'vitest';
import {prepareGuardianProof} from '@/lib/guardianProof';
describe('Guardian proof upload in an embedded browser',()=>{
 it('reads a downloaded PDF without an extension or browser MIME type',async()=>{
  const f=new File(['%PDF-1.4\nDemo consent\n%%EOF'],'Lakshmi_Devi_Vishwamohan_Authorization',{type:''});
  const proof=await prepareGuardianProof(f);expect(proof.fileName).toBe('Lakshmi_Devi_Vishwamohan_Authorization.pdf');expect(proof.fileType).toBe('application/pdf');expect(atob(proof.fileData)).toContain('Demo consent');
 });
 it('rejects an empty file with a visible actionable error',async()=>{await expect(prepareGuardianProof(new File([],'proof.pdf'))).rejects.toThrow('empty');});
 it('rejects a webpage saved under a PDF filename',async()=>{await expect(prepareGuardianProof(new File(['<html>preview</html>'],'proof.pdf'))).rejects.toThrow('actual PDF');});
 it('rejects oversized uploads before reading',async()=>{const f=new File(['a'],'proof.pdf');Object.defineProperty(f,'size',{value:5*1024*1024+1});await expect(prepareGuardianProof(f)).rejects.toThrow('5 MB');});
});
