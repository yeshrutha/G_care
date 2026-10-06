import { describe, expect, it } from 'vitest';
import { readOwnerResponse } from '@/lib/ownerResponse';
describe('Owner service responses', () => {
 it('explains an empty proxy failure', async () => {await expect(readOwnerResponse({json:async()=>{throw new SyntaxError('Unexpected end');}} as any)).rejects.toThrow('Check that the backend is running');});
 it('preserves backend setup and credential messages', async () => {expect(await readOwnerResponse({json:async()=>({error:'Owner access has not been privately configured.'})} as any)).toEqual({error:'Owner access has not been privately configured.'});});
});
