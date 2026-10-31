import React, { useEffect, useRef, useState } from 'react';
import { Bot, MessageCircle, X, Send, Loader2, RotateCcw } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';

type Turn = { role: 'user' | 'model'; content: string };

export default function FloatingChatbot() {
 const userId = useAuthStore(s => s.user?.id);
 const [open,setOpen] = useState(false);
 const [turns,setTurns] = useState<Turn[]>([]);
 const [input,setInput] = useState('');
 const [busy,setBusy] = useState(false);
 const [error,setError] = useState('');
 const pending = useRef<AbortController | null>(null);
 const requestVersion = useRef(0);
 const bottom = useRef<HTMLDivElement>(null);
 const inputRef = useRef<HTMLTextAreaElement>(null);
 const launcher = useRef<HTMLButtonElement>(null);
 const reset = () => {
  requestVersion.current++; pending.current?.abort(); pending.current=null;
  setTurns([]);setInput('');setError('');setBusy(false);
 };
 useEffect(() => { reset();return () => { requestVersion.current++;pending.current?.abort(); }; },[userId]);
 useEffect(() => {if(open&&!busy)inputRef.current?.focus();},[open,busy]);
 useEffect(() => {bottom.current?.scrollIntoView?.({behavior:'smooth'});},[turns,busy,error,open]);
 const close = () => {setOpen(false);launcher.current?.focus();};
 const send = async (event:React.FormEvent) => {
  event.preventDefault();const message=input.trim();if(!message||busy)return;
  const history=turns.slice(-12);const controller=new AbortController();pending.current=controller;
  const version=++requestVersion.current;
  setTurns(current=>[...current,{role:'user',content:message}]);setInput('');setError('');setBusy(true);
  const timeout=window.setTimeout(()=>controller.abort(),90000);
  try {
   // Only typed conversation is sent; never attach patient records or vitals.
   const result=await apiFetch<{response:string}>('/assistant/chat',{method:'POST',signal:controller.signal,body:JSON.stringify({message,conversationHistory:history,surface:'chat'})});
   if(version!==requestVersion.current)return;
   if(!result.response?.trim())throw new Error('No answer was returned. Please try again.');
   setTurns(current=>[...current,{role:'model',content:result.response.trim()}]);
  } catch(e) {
   if(version===requestVersion.current){setError(controller.signal.aborted?'The response took too long. Please try again.':e instanceof Error?e.message:'Unable to reach the assistant. Please try again.');setInput(message);setTurns(current=>current.slice(0,-1));}
  } finally {
   window.clearTimeout(timeout);
   if(version===requestVersion.current){setBusy(false);pending.current=null;inputRef.current?.focus();}
  }
 };
 if (!userId) return null;
 return <>
  {open && <section role="dialog" aria-label="G-Care AI chat" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();close();}}} className="fixed bottom-24 right-4 z-40 flex h-[min(560px,calc(100dvh-8rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl sm:right-6">
   <header className="flex items-center gap-3 bg-teal px-4 py-3 text-white"><Bot className="h-6 w-6"/><div className="flex-1"><h2 className="font-semibold">G-Care AI</h2><p className="text-xs text-white/85">Powered by Gemini</p></div><button type="button" aria-label="New conversation" onClick={reset} className="rounded-lg p-2 hover:bg-white/15"><RotateCcw className="h-4 w-4"/></button><button type="button" aria-label="Close chat" onClick={close} className="rounded-lg p-2 hover:bg-white/15"><X className="h-5 w-5"/></button></header>
   <div role="log" aria-label="Chat messages" aria-live="polite" aria-relevant="additions" className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
    {turns.length===0 && <div className="rounded-xl bg-secondary p-3 text-sm leading-relaxed">Hello! Ask me about G-Care, general topics or health information. You can type in English or Kannada.</div>}
    {turns.map((turn,i)=><div key={i} className={turn.role==='user'?'flex justify-end':'flex justify-start'}><div className={turn.role==='user'?'max-w-[90%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-teal px-3 py-2 text-sm leading-relaxed text-white':'max-w-[95%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-sm bg-secondary px-3 py-2 text-sm leading-relaxed'}><span className="sr-only">{turn.role==='user'?'You: ':'G-Care AI: '}</span>{turn.content}</div></div>)}
    {busy && <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Gemini is replying…</div>}
    {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <div ref={bottom}/>
   </div>
   <form onSubmit={send} className="flex items-end gap-2 border-t border-border bg-background p-3"><label htmlFor="chat-question" className="sr-only">Your question</label><textarea ref={inputRef} id="chat-question" value={input} maxLength={4000} rows={2} disabled={busy} placeholder="Ask a question…" onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.currentTarget.form?.requestSubmit();}}} className="max-h-28 min-h-12 flex-1 resize-none rounded-xl border border-input bg-card px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal disabled:opacity-60"/><button type="submit" aria-label="Send message" disabled={busy||!input.trim()} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal text-white hover:bg-teal/90 disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4"/></button></form>
  </section>}
  <button ref={launcher} type="button" aria-label={open?'Close AI chat':'Open AI chat'} aria-expanded={open} onClick={()=>open?close():setOpen(true)} className="fixed bottom-6 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-teal text-white shadow-lg ring-1 ring-white/20 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal/30 sm:right-6">{open?<X className="h-6 w-6"/>:<MessageCircle className="h-7 w-7"/>}</button>
 </>;
}
