import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {Simulate} from 'react-dom/test-utils';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({userId:'account-one'}));
vi.mock('@/store/authStore',()=>({useAuthStore:(selector:any)=>selector({user:state.userId?{id:state.userId}:null})}));
vi.mock('@/lib/api',()=>({apiFetch:vi.fn()}));
import {apiFetch} from '@/lib/api';
import FloatingChatbot from '@/components/FloatingChatbot';
const api=vi.mocked(apiFetch);let root:ReturnType<typeof createRoot>;let container:HTMLDivElement;
const button=(label:string)=>container.querySelector<HTMLButtonElement>('button[aria-label="'+label+'"]')!;
const settle=async()=>{await act(async()=>{await Promise.resolve();});};
beforeEach(()=>{api.mockReset();state.userId='account-one';(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;container=document.createElement('div');document.body.appendChild(container);root=createRoot(container);act(()=>root.render(<FloatingChatbot/>));});
afterEach(()=>{act(()=>root.unmount());container.remove();});
const open=()=>act(()=>button('Open AI chat').click());
const send=(text:string)=>{const input=container.querySelector('textarea')!;act(()=>{input.value=text;Simulate.change(input);});act(()=>button('Send message').click());};
it('sends typed questions only and retains history for follow-ups',async()=>{
 api.mockResolvedValueOnce({response:'First answer'}).mockResolvedValueOnce({response:'Second answer'});open();send('What is G-Care?');await settle();expect(container.textContent).toContain('First answer');
 expect(JSON.parse(api.mock.calls[0][1]!.body as string)).toEqual({message:'What is G-Care?',conversationHistory:[],surface:'chat'});send('Explain more');await settle();expect(container.textContent).toContain('Second answer');expect(JSON.parse(api.mock.calls[1][1]!.body as string).conversationHistory).toEqual([{role:'user',content:'What is G-Care?'},{role:'model',content:'First answer'}]);
 act(()=>button('Close chat').click());expect(container.querySelector('[role="dialog"]')).toBeNull();open();expect(container.textContent).toContain('Second answer');
});
it('shows failures and preserves the typed question for retry',async()=>{api.mockRejectedValueOnce(new Error('Service unavailable'));open();send('Hello');await settle();expect(container.querySelector('[role="alert"]')?.textContent).toBe('Service unavailable');expect(container.querySelector('textarea')!.value).toBe('Hello');expect(button('Send message').disabled).toBe(false);});
it('clears conversation when account identity changes',async()=>{api.mockResolvedValue({response:'Account one conversation'});open();send('Hello');await settle();expect(container.textContent).toContain('Account one conversation');state.userId='account-two';act(()=>root.render(<FloatingChatbot/>));expect(container.textContent).not.toContain('Account one conversation');});
it('aborts and ignores a pending reply when a new conversation starts',async()=>{let resolve:any;api.mockImplementation(()=>new Promise(r=>{resolve=r;}));open();send('Old question');expect(container.querySelector('[role="status"]')).not.toBeNull();const signal=api.mock.calls[0][1]!.signal;act(()=>button('New conversation').click());expect(signal?.aborted).toBe(true);await act(async()=>{resolve({response:'Old answer'});});expect(container.querySelector('[role="status"]')).toBeNull();expect(container.textContent).not.toContain('Old answer');});

it('hides the launcher and conversation immediately after logout',async()=>{api.mockResolvedValue({response:'Previous conversation'});open();send('Hello');await settle();state.userId='';act(()=>root.render(<FloatingChatbot/>));expect(container.querySelector('button')).toBeNull();expect(container.querySelector('[role="dialog"]')).toBeNull();expect(container.textContent).not.toContain('Previous conversation');});
