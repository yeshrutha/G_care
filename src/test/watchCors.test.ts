import {it,expect} from 'vitest';
import {sendJson} from '../../server/http.js';
it('allows the watch pairing header for Vercel browser preflight requests',()=>{
 let headers:any;const response={writeHead:(status:number,h:any)=>{expect(status).toBe(204);headers=h;},end:()=>{}};
 sendJson(response,204,null,{headers:{origin:'https://g-care-one.vercel.app'}});
 expect(headers['Access-Control-Allow-Origin']).toBe('https://g-care-one.vercel.app');
 expect(headers['Access-Control-Allow-Headers'].toLowerCase().split(',').map((h:string)=>h.trim())).toContain('x-watch-token');
 expect(headers['Access-Control-Allow-Methods']).toContain('POST');
});