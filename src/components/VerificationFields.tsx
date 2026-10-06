import React, { useEffect, useState, useRef } from 'react';
import { apiFetch, UserRole, ProofUpload } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface VerificationInput {
  proofFile?: ProofUpload;
  proofId: string; issuer: string; proofReference: string;
  staffKind: 'nurse' | 'assistant'; relationship: string; supervisingDoctorId: string;
}
export const emptyVerification: VerificationInput = {
  proofId: '', issuer: '', proofReference: '', staffKind: 'nurse', relationship: 'son', supervisingDoctorId: '',
};
export default function VerificationFields({ role, value, onChange }: {
  role: UserRole; value: VerificationInput; onChange: (value: VerificationInput) => void;
}) {
  const [doctors, setDoctors] = useState<{ id: string; name: string; hospital: string; demo: boolean }[]>([]);
  const [directoryError, setDirectoryError] = useState('');
  const [fileError, setFileError] = useState('');
  const [reading, setReading] = useState(false);
  const selection = useRef(0);
  const current = useRef(value); current.current = value;
  const selectProof = async (file?: File) => {
    const request = ++selection.current;
    setReading(false); setFileError(''); onChange({ ...value, proofFile: undefined });
    if (!file) return;
    if (!/\.(pdf|png|jpe?g|webp|docx?)$/i.test(file.name) || !file.size || file.size > 5 * 1024 * 1024) { setFileError('Choose a PDF, image or Word document up to 5 MB.'); return; }
    setReading(true);
    try {
      const fileData = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('File could not be read.')); reader.readAsDataURL(file); });
      if (request !== selection.current) return;
      onChange({ ...current.current, proofFile: { fileName: file.name, fileType: file.type, fileSize: file.size, fileData }, proofReference: '' });
    } catch { setFileError('File could not be read. Please select it again.'); } finally { if (request === selection.current) setReading(false); }
  };
  useEffect(() => {
    let cancelled = false;
    apiFetch<typeof doctors>('/auth/doctors').then(data => { if (!cancelled) setDoctors(data); })
      .catch(() => { if (!cancelled) setDirectoryError('Doctor list could not load. Please retry before submitting.'); });
    return () => { cancelled = true; };
  }, []);
  const update = (key: keyof VerificationInput, next: string) => onChange({ ...value, [key]: next });
  return <fieldset className="space-y-3 rounded-lg border p-4">
    <legend className="px-1 font-medium">Account verification</legend>
    <p className="text-sm text-muted-foreground">Your request needs evidence review and patient assignment before sign-in. An ID number alone does not verify your identity.</p>
    {role === 'caretaker' && <div>
      <Label htmlFor="staff-kind">Professional role</Label>
      <select id="staff-kind" value={value.staffKind} onChange={e => update('staffKind', e.target.value)} className="mt-1 w-full rounded-md border bg-background p-2">
        <option value="nurse">Nurse</option><option value="assistant">Doctor’s assistant</option>
      </select>
      <p className="mt-1 text-xs text-muted-foreground">Family members must request Guardian access.</p>
    </div>}
    {role === 'guardian' && <div>
      <Label htmlFor="guardian-relationship">Relationship to the patient</Label>
      <select id="guardian-relationship" value={value.relationship} onChange={e => update('relationship', e.target.value)} className="mt-1 w-full rounded-md border bg-background p-2">
        <option value="son">Son</option><option value="daughter">Daughter</option><option value="spouse">Spouse</option><option value="relative">Relative</option><option value="authorized_guardian">Authorized guardian</option>
      </select>
    </div>}
    {role !== 'doctor' && <div>
      <Label htmlFor="supervising-doctor">{role === 'caretaker' ? 'Supervising doctor' : 'Patient’s doctor'}</Label>
      <select id="supervising-doctor" value={value.supervisingDoctorId} onChange={e => update('supervisingDoctorId', e.target.value)} className="mt-1 w-full rounded-md border bg-background p-2">
        <option value="">Owner review / no doctor assigned yet</option>
        {doctors.map(d => <option key={d.id} value={d.id}>{d.name}{d.hospital ? ` — ${d.hospital}` : ''}{d.demo ? ' (demo only)' : ''}</option>)}
      </select>
      {directoryError && <p className="text-sm text-destructive">{directoryError}</p>}
      {!directoryError && !doctors.length && <p className="text-sm text-muted-foreground">You can submit proof now. The owner will review and assign patient access.</p>}
    </div>}
    <div><Label htmlFor="proof-id">{role === 'doctor' ? 'Medical registration number' : role === 'caretaker' ? 'Nursing registration or staff ID' : 'Patient consent / authorization reference'}</Label>
      <Input required minLength={3} maxLength={120} id="proof-id" value={value.proofId} onChange={e => update('proofId', e.target.value)} />
    </div>
    <div><Label htmlFor="proof-issuer">{role === 'guardian' ? 'Consent issuer / authorizing person' : 'Issuing council, hospital or clinic'}</Label>
      <Input required minLength={3} maxLength={160} id="proof-issuer" value={value.issuer} onChange={e => update('issuer', e.target.value)} />
    </div>
    <div><Label htmlFor="proof-upload">Upload proof of identity or authorization</Label>
      <Input required id="proof-upload" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" onChange={e => void selectProof(e.target.files?.[0])} />
      <p className="mt-1 text-xs text-muted-foreground">PDF, JPG, PNG, WebP or Word document, up to 5 MB. Proof is stored privately for owner review. A listed supervising doctor may also review requests assigned to them.</p>
      {reading && <p role="status">Reading document…</p>}
      {value.proofFile && <p className="text-sm">Selected: {value.proofFile.fileName}</p>}
      {fileError && <p role="alert" className="text-sm text-destructive">{fileError}</p>}
    </div>
  </fieldset>;
}
