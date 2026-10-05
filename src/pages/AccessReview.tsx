import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch, AuthUser, downloadVerificationProof } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export default function AccessReview() {
  const user = useAuthStore(s => s.user);
  const [requests, setRequests] = useState<AuthUser[]>([]);
  const [elders, setElders] = useState<{ id: string; full_name: string }[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const verified = user?.accessStatus === 'approved';
  const load = async () => {
    const [accounts, patients] = await Promise.all([apiFetch<AuthUser[]>('/auth/access-requests'), apiFetch<typeof elders>('/elders')]);
    setRequests(accounts); setElders(patients);
    setSelected(Object.fromEntries(accounts.map(a => [a.id, a.assignedElderIds || []])));
  };
  useEffect(() => { if (verified) load().catch(e => setError(e.message)); }, [verified]);
  const review = async (account: AuthUser, decision: string) => {
    setError(''); setMessage(''); setBusy(true);
    try {
      await apiFetch(`/auth/access-requests/${encodeURIComponent(account.id)}`, {
        method: 'PUT', body: JSON.stringify({ decision, elderIds: selected[account.id] || [], note: notes[account.id] || '' }),
      });
      await load(); setMessage(`Access request ${decision}.`);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  };
  return <main className="mx-auto max-w-4xl space-y-5 p-6">
    <Link to="/doctor" className="text-teal">← Doctor Portal</Link>
    <h1 className="font-display text-2xl">Caretaker and Guardian Access Requests</h1>
    <p className="text-muted-foreground">Check the applicant’s evidence directly with the issuing organization or patient. Approve only the selected patients. Submitted IDs are claims until you review them.</p>
    {!verified && <p role="status" className="rounded-lg border p-4">Demo accounts cannot approve real applicants. The project owner must first verify your doctor account.</p>}
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {message && <p role="status" className="text-teal">{message}</p>}
    {verified && !requests.length && <p>No applicants are assigned to you.</p>}
    {requests.map(account => {
      const proof = account.profile?.accessVerification;
      return <section key={account.id} className="space-y-3 rounded-lg border bg-card p-5">
        <h2 className="font-semibold">{account.name} — {account.role === 'caretaker' ? proof?.staffKind : 'Guardian'}</h2>
        <p className="text-sm">{account.email} · Status: {account.accessStatus}</p>
        <dl className="space-y-1 text-sm">
          <div><dt className="inline font-medium">ID / authorization: </dt><dd className="inline">{proof?.proofId}</dd></div>
          <div><dt className="inline font-medium">Issuer: </dt><dd className="inline">{proof?.issuer}</dd></div>
          <div><dt className="inline font-medium">Evidence reference: </dt><dd className="inline break-all">{proof?.proofReference}{proof?.proofFile && <Button variant="outline" size="sm" onClick={() => downloadVerificationProof(account.id, proof.proofFile!.fileName).catch(e => setError(e.message))}>Download proof: {proof.proofFile.fileName}</Button>}</dd></div>
          {account.role === 'guardian' && <div><dt className="inline font-medium">Requested patient / relationship: </dt><dd className="inline">{account.profile?.elderName} / {proof?.relationship}</dd></div>}
        </dl>
        <fieldset className="space-y-2"><legend className="font-medium">Allowed patients</legend>
          {elders.map(e => <label key={e.id} className="mr-4 inline-flex items-center gap-2">
            <input type="checkbox" checked={(selected[account.id] || []).includes(e.id)} onChange={event => setSelected(prev => ({ ...prev, [account.id]: event.target.checked ? [...(prev[account.id] || []), e.id] : (prev[account.id] || []).filter(id => id !== e.id) }))} />{e.full_name}
          </label>)}
        </fieldset>
        <label className="block text-sm font-medium" htmlFor={`review-${account.id}`}>Evidence checked and review note (required)</label>
        <Textarea id={`review-${account.id}`} maxLength={1000} value={notes[account.id] || ''} onChange={e => setNotes(prev => ({ ...prev, [account.id]: e.target.value }))} placeholder="Record how you checked the proof and patient authorization." />
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => review(account, 'approved')}>Approve selected patients</Button>
          <Button disabled={busy} variant="outline" onClick={() => review(account, 'rejected')}>Reject request</Button>
          {account.accessStatus === 'approved' && <Button disabled={busy} variant="destructive" onClick={() => review(account, 'suspended')}>Suspend access</Button>}
        </div>
      </section>;
    })}
  </main>;
}
