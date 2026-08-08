import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GuardianLogo } from '@/components/GuardianLogo';
import { useAppStore, type DemoElder, type Medication } from '@/store';
import { useAuthStore } from '@/store/authStore';
import { apiFetch } from '@/lib/api';
import { toast } from '@/hooks/use-toast';
import { DEMO_ELDERS, DEMO_MEDICATIONS } from '@/lib/demoData';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ArrowLeft, FileText, LogOut, Video, UploadCloud, Folder, Clipboard, Plus, Shield, User } from 'lucide-react';

interface ClinicalReport {
  id: string;
  elderId: string;
  doctorId: string;
  doctorName: string;
  title: string;
  description: string;
  category: string;
  fileUrl: string;
  createdAt: string;
}

interface DoctorCareTeam {
  id: string;
  name: string;
  email: string;
  phone: string;
  specialization: string;
  hospital: string;
}

const DoctorPortal: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { demoMode } = useAppStore();
  const { user: authUser, logout } = useAuthStore();
  const [elders, setElders] = useState<DemoElder[]>(DEMO_ELDERS);
  const [selectedElder, setSelectedElder] = useState(DEMO_ELDERS[0]);
  
  // Clinical Notes State
  const [clinicalNote, setClinicalNote] = useState('');
  const [notesList, setNotesList] = useState<any[]>([]);

  // Reports State
  const [reportsList, setReportsList] = useState<ClinicalReport[]>([]);
  const [newReport, setNewReport] = useState({
    title: '',
    category: 'Lab Report',
    description: '',
  });
  const [selectedFile, setSelectedFile] = useState<{ name: string; size: string } | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [previewReport, setPreviewReport] = useState<ClinicalReport | null>(null);

  // Care Team State
  const [careTeam, setCareTeam] = useState<DoctorCareTeam[]>([]);

  // Fetch initial patient list
  useEffect(() => {
    if (demoMode) return;
    let ignore = false;
    apiFetch<{ elders?: DemoElder[] }>('/dashboard-data')
      .then((data) => {
        if (ignore) return;
        const nextElders = Array.isArray(data.elders) && data.elders.length > 0 ? data.elders : DEMO_ELDERS;
        setElders(nextElders);
        setSelectedElder((current) => nextElders.find((elder) => elder.id === current.id) || nextElders[0]);
      })
      .catch(() => {
        setElders(DEMO_ELDERS);
      });

    return () => { ignore = true; };
  }, [demoMode]);

  // Fetch data dependent on selected patient
  useEffect(() => {
    if (!selectedElder?.id) return;
    let ignore = false;

    // Fetch clinical notes
    apiFetch<any[]>(`/clinical-notes?elderId=${selectedElder.id}`)
      .then((data) => {
        if (ignore) return;
        setNotesList(data);
      })
      .catch(() => {
        if (ignore) return;
        setNotesList([
          { id: 'note-1', note: 'Patient showing good response to current antihypertensive regimen. BP trend improving.', doctorName: 'Dr. Ramesh Kumar', createdAt: new Date(Date.now() - 36000000).toISOString() }
        ]);
      });

    // Fetch clinical reports
    apiFetch<ClinicalReport[]>(`/reports?elderId=${selectedElder.id}`)
      .then((data) => {
        if (ignore) return;
        setReportsList(data);
      })
      .catch(() => {
        if (ignore) return;
        setReportsList([
          { id: 'rep-1', elderId: selectedElder.id, doctorId: 'dr-1', doctorName: 'Dr. Ramesh Kumar', title: 'Complete Blood Count (CBC)', description: 'Hemoglobin levels normal. WBC and Platelets inside limits. Blood glucose marginally elevated.', category: 'Lab Report', fileUrl: 'cbc_report.pdf', createdAt: new Date(Date.now() - 172800000).toISOString() }
        ]);
      });

    // Fetch Care Team
    apiFetch<DoctorCareTeam[]>(`/care-team?elderId=${selectedElder.id}`)
      .then((data) => {
        if (ignore) return;
        setCareTeam(data);
      })
      .catch(() => {
        if (ignore) return;
        setCareTeam([
          { id: 'dr-1', name: 'Dr. Ramesh Kumar', email: 'dr.ramesh@apollo.in', phone: '+91 98765 43211', specialization: 'Cardiologist', hospital: 'Apollo Hospitals' }
        ]);
      });

    return () => { ignore = true; };
  }, [selectedElder?.id]);

  const handleSaveNote = async () => {
    if (!clinicalNote.trim() || !selectedElder?.id) return;
    try {
      const saved = await apiFetch<any>('/clinical-notes', {
        method: 'POST',
        body: JSON.stringify({
          elderId: selectedElder.id,
          note: clinicalNote,
        }),
      });
      setNotesList((prev) => [saved, ...prev]);
      setClinicalNote('');
      toast({ title: 'Success', description: 'Clinical note saved successfully' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to save note', variant: 'destructive' });
    }
  };

  const simulateFileUpload = () => {
    setSelectedFile({ name: `${newReport.title.toLowerCase().replace(/\s+/g, '_') || 'medical_record'}.pdf`, size: '1.4 MB' });
  };

  const handleUploadReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReport.title.trim()) {
      toast({ title: 'Validation Error', description: 'Please enter a report title.', variant: 'destructive' });
      return;
    }

    try {
      // Simulate file upload progress
      setUploadProgress(10);
      const timer = setInterval(() => {
        setUploadProgress((p) => {
          if (p === null) return null;
          if (p >= 100) {
            clearInterval(timer);
            return 100;
          }
          return p + 30;
        });
      }, 200);

      // Await progress animation
      await new Promise((r) => setTimeout(r, 800));

      const fileUrl = selectedFile ? selectedFile.name : 'uploaded_report.pdf';

      const saved = await apiFetch<ClinicalReport>('/reports', {
        method: 'POST',
        body: JSON.stringify({
          elderId: selectedElder.id,
          title: newReport.title,
          category: newReport.category,
          description: newReport.description,
          fileUrl,
        }),
      });

      setReportsList((prev) => [saved, ...prev]);
      setNewReport({ title: '', category: 'Lab Report', description: '' });
      setSelectedFile(null);
      setUploadProgress(null);
      toast({ title: 'Success', description: 'Clinical report uploaded successfully' });
    } catch (err: any) {
      setUploadProgress(null);
      toast({ title: 'Error', description: err.message || 'Failed to upload report', variant: 'destructive' });
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Patient sidebar */}
      <aside className="w-72 bg-card border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <GuardianLogo />
          <p className="text-xs text-muted-foreground mt-2 font-semibold tracking-wider text-teal uppercase">Doctor Portal</p>
        </div>
        <div className="p-4 border-b border-border">
          <p className="text-sm font-medium text-foreground">{authUser?.name || 'Dr. Ramesh Kumar'}</p>
          <p className="text-xs text-muted-foreground">{authUser?.profile?.specialization || 'Cardiologist'} · {authUser?.profile?.hospital || 'Apollo Hospitals'}</p>
        </div>
        <div className="p-2 flex-1 overflow-y-auto">
          <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Patients</p>
          {elders.map(elder => (
            <button key={elder.id} onClick={() => setSelectedElder(elder)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all ${
                selectedElder.id === elder.id ? 'bg-secondary text-teal font-semibold' : 'text-muted-foreground hover:bg-muted'
              }`}>
              <p className="font-medium text-foreground">{elder.full_name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">Age {elder.age} · {elder.medical_conditions[0] || 'No baseline constraints'}</p>
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-border space-y-2">
          <button onClick={() => navigate('/dashboard')} className="w-full text-sm text-muted-foreground hover:text-foreground flex items-center gap-2 py-1.5 justify-start">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </button>
          <button onClick={async () => { await logout(); navigate('/'); }} className="w-full text-sm text-destructive hover:text-destructive/80 flex items-center gap-2 py-1.5 justify-start">
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </aside>

      {/* Main clinical space */}
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="flex items-center justify-between border-b border-border/60 pb-4">
            <div>
              <h1 className="font-display text-2xl font-bold text-foreground">{selectedElder.full_name}</h1>
              <p className="text-sm text-muted-foreground">Age {selectedElder.age} · Conditions: {selectedElder.medical_conditions.join(', ') || 'None'}</p>
            </div>
            <Button className="bg-teal hover:bg-teal/90 text-primary-foreground">
              <Video className="h-4 w-4 mr-2" /> Telehealth consultation
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left section - clinical reports */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Form - Upload new report */}
              <Card className="rounded-xl border border-border/80 shadow-sm">
                <CardHeader>
                  <CardTitle className="font-display text-lg flex items-center gap-2 text-foreground">
                    <UploadCloud className="h-5 w-5 text-teal" /> Upload Patient Medical Report
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleUploadReport} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="rep-title">Document/Report Title *</Label>
                        <Input id="rep-title" placeholder="Complete Blood Count, Chest X-Ray..." value={newReport.title}
                          onChange={e => setNewReport({ ...newReport, title: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="rep-cat">Report Category</Label>
                        <Select value={newReport.category} onValueChange={v => setNewReport({ ...newReport, category: v })}>
                          <SelectTrigger id="rep-cat"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Lab Report">Lab Report / Blood Test</SelectItem>
                            <SelectItem value="ECG / Cardiology">ECG / Cardiology</SelectItem>
                            <SelectItem value="Radiology / Scan">Radiology / Imaging</SelectItem>
                            <SelectItem value="Prescription">Prescription Document</SelectItem>
                            <SelectItem value="Discharge Summary">Discharge Summary</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="rep-desc">Clinical Findings / Notes</Label>
                      <Textarea id="rep-desc" placeholder="Enter patient notes, diagnosed levels, normal/abnormal values..."
                        value={newReport.description} onChange={e => setNewReport({ ...newReport, description: e.target.value })}
                        className="min-h-[90px]" />
                    </div>

                    <div className="space-y-2">
                      <Label>Select Document File</Label>
                      {selectedFile ? (
                        <div className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg border border-teal/20 text-xs">
                          <span className="font-medium text-teal">{selectedFile.name} ({selectedFile.size})</span>
                          <Button type="button" variant="ghost" size="sm" className="h-6 text-destructive px-2" onClick={() => setSelectedFile(null)}>Remove</Button>
                        </div>
                      ) : (
                        <div onClick={simulateFileUpload} className="border-2 border-dashed border-border hover:border-teal/50 cursor-pointer rounded-lg p-5 flex flex-col items-center justify-center text-xs text-muted-foreground gap-1.5 transition-colors">
                          <Folder className="h-6 w-6 text-muted-foreground/60" />
                          <span>Click to browse and simulate uploading PDF / Document</span>
                          <span className="text-[10px] text-muted-foreground/40">PDF, JPG, PNG up to 10MB</span>
                        </div>
                      )}
                    </div>

                    {uploadProgress !== null && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Uploading record...</span>
                          <span>{Math.min(uploadProgress, 100)}%</span>
                        </div>
                        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                          <div className="h-full bg-teal transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
                        </div>
                      </div>
                    )}

                    <Button type="submit" disabled={!newReport.title} className="w-full bg-teal hover:bg-teal/90 text-primary-foreground mt-2">
                      <Plus className="h-4 w-4 mr-1" /> Add Record to Patient History
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Patient reports history list */}
              <Card className="rounded-xl border border-border/80 shadow-sm">
                <CardHeader>
                  <CardTitle className="font-display text-lg flex items-center gap-2 text-foreground">
                    <Folder className="h-5 w-5 text-teal" /> Medical Record History
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {reportsList.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground border-2 border-dashed border-border rounded-lg">
                      No clinical reports found for {selectedElder.full_name}.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {reportsList.map((report) => (
                        <div key={report.id} className="p-4 bg-muted/30 border border-border/60 hover:border-teal/30 rounded-xl transition-all flex flex-col md:flex-row md:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <Badge className="bg-secondary text-teal hover:bg-secondary/80 text-[10px] border-0">{report.category}</Badge>
                              <span className="text-xs text-muted-foreground">{new Date(report.createdAt).toLocaleDateString()}</span>
                            </div>
                            <h4 className="font-medium text-foreground text-sm">{report.title}</h4>
                            <p className="text-xs text-muted-foreground line-clamp-1">{report.description || 'No comments entered.'}</p>
                            <p className="text-[10px] text-muted-foreground/60">Uploaded by: {report.doctorName || 'Dr. Ramesh Kumar'}</p>
                          </div>
                          <Button size="sm" variant="outline" className="border-teal text-teal hover:bg-teal/5 text-xs h-8" onClick={() => setPreviewReport(report)}>
                            <FileText className="h-3 w-3 mr-1" /> View Details
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Right section - Clinical recommendations & care team */}
            <div className="space-y-6">
              
              {/* Assigned doctors care team */}
              <Card className="rounded-xl border border-border/80 shadow-sm">
                <CardHeader>
                  <CardTitle className="font-display text-lg flex items-center gap-2 text-foreground">
                    <User className="h-5 w-5 text-teal" /> Care Team Directory
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {careTeam.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-4">No care team assigned to this patient.</p>
                  ) : (
                    careTeam.map((doc) => (
                      <div key={doc.id} className="p-3 bg-secondary/15 rounded-xl border border-teal/10 space-y-1">
                        <p className="text-sm font-semibold text-teal">{doc.name}</p>
                        <p className="text-xs text-foreground font-medium">{doc.specialization}</p>
                        <p className="text-[11px] text-muted-foreground">{doc.hospital}</p>
                        <div className="pt-2 border-t border-teal/10 mt-2 flex flex-col gap-0.5 text-[10px] text-muted-foreground">
                          <span>Email: {doc.email}</span>
                          <span>Phone: {doc.phone}</span>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Form - Clinical Notes */}
              <Card className="rounded-xl border border-border/80 shadow-sm">
                <CardHeader>
                  <CardTitle className="font-display text-lg flex items-center gap-2 text-foreground">
                    <Clipboard className="h-5 w-5 text-teal" /> Recommendations & notes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Textarea placeholder="Add quick recommendations, vitals comments, followups..." value={clinicalNote} onChange={e => setClinicalNote(e.target.value)}
                      className="min-h-[100px]" />
                    <Button onClick={handleSaveNote} disabled={!clinicalNote.trim()} className="w-full bg-teal hover:bg-teal/90 text-primary-foreground text-xs">
                      <FileText className="h-3.5 w-3.5 mr-1" /> Save Note
                    </Button>
                  </div>
                  
                  <div className="space-y-3 pt-2 border-t border-border/60">
                    <p className="text-xs font-semibold text-muted-foreground tracking-wider uppercase">Recommendation Log</p>
                    {notesList.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2 text-center">No notes written yet.</p>
                    ) : (
                      <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
                        {notesList.map((noteItem) => (
                          <div key={noteItem.id} className="p-3 bg-muted/50 rounded-lg text-xs space-y-1">
                            <div className="flex justify-between text-[10px] text-muted-foreground font-medium">
                              <span>{noteItem.doctorName || noteItem.doctor_name || 'Dr. Ramesh Kumar'}</span>
                              <span>{new Date(noteItem.createdAt || noteItem.created_at || Date.now()).toLocaleDateString()}</span>
                            </div>
                            <p className="text-foreground leading-relaxed">{noteItem.note}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>

      {/* Preview Modal for Reports */}
      {previewReport && (
        <Dialog open={previewReport !== null} onOpenChange={(open) => { if (!open) setPreviewReport(null); }}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="font-display text-lg">{previewReport.title}</DialogTitle>
              <DialogDescription className="text-xs">
                Medical record uploaded on {new Date(previewReport.createdAt).toLocaleString()} by {previewReport.doctorName}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="font-semibold text-muted-foreground block mb-0.5">Category</span>
                  <Badge className="bg-secondary text-teal hover:bg-secondary border-0">{previewReport.category}</Badge>
                </div>
                <div>
                  <span className="font-semibold text-muted-foreground block mb-0.5">Attached File</span>
                  <span className="text-teal font-medium hover:underline cursor-pointer flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" /> {previewReport.fileUrl || 'No file attached'}
                  </span>
                </div>
              </div>
              
              <div className="p-4 bg-muted/50 rounded-xl space-y-1.5 border border-border/40">
                <span className="font-semibold text-xs text-muted-foreground block">Clinical Observations & Findings</span>
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
                  {previewReport.description || 'No comments entered.'}
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={() => setPreviewReport(null)} className="bg-teal hover:bg-teal/90 text-primary-foreground">Close</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default DoctorPortal;
