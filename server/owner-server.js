import http from 'node:http';
try { process.loadEnvFile(); } catch {}
try { process.loadEnvFile('.env.owner'); } catch {}
if(!process.env.OWNER_DATABASE_URL)throw Error('Save OWNER_DATABASE_URL privately before starting the live owner connection.');
const url=new URL(process.env.OWNER_DATABASE_URL);
if(!['postgres:','postgresql:'].includes(url.protocol))throw Error('Owner connection must be PostgreSQL.');
url.searchParams.delete('sslmode');
process.env.DATABASE_URL=url.toString();process.env.PGSSL='true';process.env.PGSSL_REJECT_UNAUTHORIZED='true';
process.env.OWNER_LIVE_CONNECTION='true';process.env.OWNER_LOCAL_ENABLED='true';process.env.NODE_ENV='development';process.env.DEMO_AUTH_ENABLED='false';
const {initDb,closeDb}=await import('./db.js');
const {handleOwner}=await import('./ownerPortal.js');const {sendJson,rateLimit}=await import('./http.js');
await initDb();
const server=http.createServer(async(req,res)=>{try{if(!rateLimit(req,res))return;const pathname=new URL(req.url,'http://localhost').pathname;if(pathname==='/api/owner/connection')return sendJson(res,200,{mode:'Live G-Care database',localPortal:true},req);if(!pathname.startsWith('/api/owner/'))return sendJson(res,404,{error:'Not found'},req);return await handleOwner(req,res,pathname);}catch{sendJson(res,503,{error:'Owner connection unavailable. Check the private database settings.'},req);}});
server.listen(8788,'127.0.0.1',()=>console.log('Local owner backend connected to live G-Care on 127.0.0.1:8788.'));
async function stop(){server.close();await closeDb();process.exit(0);}process.on('SIGTERM',stop);process.on('SIGINT',stop);
