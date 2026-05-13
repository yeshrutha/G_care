import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { GuardianLogo } from '@/components/GuardianLogo';
import { useAppStore } from '@/store';
import { DEMO_ELDERS, DEMO_VITALS, DEMO_HR_HISTORY, DEMO_MEDICATIONS } from '@/lib/demoData';
import { ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowLeft, Video, FileText, LogOut } from 'lucide-react';
import { useState } from 'react';

const DoctorPortal: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { authUser, setAuthUser } = useAppStore();
  const [selectedElder, setSelectedElder] = useState(DEMO_ELDERS[0]);
  const [clinicalNote, setClinicalNote] = useState('');

  React.useEffect(() => {
    if (!authUser) {
      setAuthUser({ id: '2', name: 'Dr. Ramesh Kumar', role: 'doctor', email: 'dr.ramesh@apollo.in' });
    }
  }, []);

  const vitals = DEMO_VITALS[selectedElder.id];
  const meds = DEMO_MEDICATIONS.filter(m => m.elder_id === selectedElder.id);
  const chartData = DEMO_HR_HISTORY.map(d => ({
    ...d,
    time: new Date(d.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }));

  return (
    <div className="min-h-screen bg-background flex">
      {/* Patient sidebar */}
      <aside className="w-72 bg-card border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <GuardianLogo />
          <p className="text-xs text-muted-foreground mt-2">Doctor Portal</p>
        </div>
        <div className="p-4 border-b border-border">
          <p className="text-sm font-medium text-foreground">{authUser?.name || 'Dr. Ramesh Kumar'}</p>
          <p className="text-xs text-muted-foreground">Cardiologist · Apollo Hospitals</p>
        </div>
        <div className="p-2 flex-1 overflow-y-auto">
          <p className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase">Patients</p>
          {DEMO_ELDERS.map(elder => (
            <button key={elder.id} onClick={() => setSelectedElder(elder)}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                selectedElder.id === elder.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted'
              }`}>
              <p className="font-medium">{elder.full_name}</p>
              <p className="text-xs text-muted-foreground">Age {elder.age} · {elder.medical_conditions[0]}</p>
            </button>
          ))}
        </div>
        <div className="p-4 border-t border-border space-y-2">
          <button onClick={() => navigate('/dashboard')} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </button>
          <button onClick={() => { setAuthUser(null); navigate('/'); }} className="text-sm text-destructive hover:text-destructive/80 flex items-center gap-2">
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </aside>

      {/* Patient detail */}
      <main className="flex-1 p-6 overflow-y-auto">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="font-display text-2xl text-foreground">{selectedElder.full_name}</h1>
              <p className="text-sm text-muted-foreground">Age {selectedElder.age} · {selectedElder.medical_conditions.join(', ')}</p>
            </div>
            <Button className="bg-teal hover:bg-teal/90 text-primary-foreground">
              <Video className="h-4 w-4 mr-2" /> Start Video Call
            </Button>
          </div>

          <Card className="rounded-xl">
            <CardHeader><CardTitle className="font-display">30-Day Vitals Overview</CardTitle></CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData}>
                    <XAxis dataKey="time" tick={{ fontSize: 9 }} interval={19} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="hr" stroke="#00B4A6" strokeWidth={2} dot={false} name="Heart Rate" />
                    <Line type="monotone" dataKey="spo2" stroke="#3B82F6" strokeWidth={1.5} dot={false} name="SpO₂" />
                    <Bar dataKey="stress" fill="#6B46C1" opacity={0.3} name="Stress" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl">
            <CardHeader><CardTitle className="font-display">Medication Adherence</CardTitle></CardHeader>
            <CardContent>
              {meds.map(med => (
                <div key={med.id} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-foreground">{med.brand_name} {med.dose_amount}{med.dose_unit}</p>
                    <p className="text-xs text-muted-foreground">{med.generic_name}</p>
                  </div>
                  <Badge className="bg-gw-green/15 text-gw-green border-0">87% adherence</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-xl">
            <CardHeader><CardTitle className="font-display">Recent AI Summaries</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {['Today', 'Yesterday', '2 days ago'].map((day, i) => (
                <div key={i} className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs font-medium text-muted-foreground mb-1">{day}</p>
                  <p className="text-sm text-foreground leading-relaxed">
                    {i === 0
                      ? 'Vitals stable. BP showing mild upward trend (+3.8 mmHg/day over 3 days). SpO₂ consistent at 97%.'
                      : i === 1
                        ? 'All vitals within baseline. Stress elevated in afternoon (peak 52/100). Good medication adherence.'
                        : 'Heart rate averaged 70 bpm. Blood pressure normal at 122/80. Full medication compliance.'
                    }
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-xl">
            <CardHeader><CardTitle className="font-display">Clinical Notes</CardTitle></CardHeader>
            <CardContent>
              <Textarea placeholder="Add clinical notes..." value={clinicalNote} onChange={e => setClinicalNote(e.target.value)}
                className="min-h-[100px] mb-3" />
              <Button className="bg-teal hover:bg-teal/90 text-primary-foreground">
                <FileText className="h-4 w-4 mr-2" /> Save Note
              </Button>
              <div className="mt-6 space-y-3">
                <div className="p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">March 28, 2025 — Dr. Ramesh Kumar</p>
                  <p className="text-sm text-foreground mt-1">Patient showing good response to current antihypertensive regimen. BP trend improving.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

export default DoctorPortal;
