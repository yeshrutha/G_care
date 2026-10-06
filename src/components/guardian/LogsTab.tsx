import { demoHistory } from '@/lib/patientSimulation.js';
import { useAppStore } from '@/store';
import { apiFetch } from '@/lib/api';
import React, { useEffect, useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { getWeeklyAverages, getMonthlyAverages, type VitalsRow } from '@/lib/csvLoader';
import { CalendarDays, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';

const LogsTab: React.FC = () => {
  const id=useAppStore(s=>s.activeElderId);
  const patient=useAppStore(s=>s.demoElders.find(e=>e.id===s.activeElderId));
  const simulated=useAppStore(s=>s.demoVitals[s.activeElderId]?.source==='simulator');
  const [vitalsData, setVitalsData] = useState<VitalsRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{let cancelled=false;setVitalsData([]);setLoading(true);const load=async()=>{try{const data=simulated&&patient?demoHistory(patient):id?await apiFetch<VitalsRow[]>('/vitals?elderId='+encodeURIComponent(id)+'&limit=10000'):[];if(!cancelled)setVitalsData(data.slice().sort((a,b)=>a.timestamp.localeCompare(b.timestamp)));}catch{if(!cancelled)setVitalsData([]);}finally{if(!cancelled)setLoading(false);}};void load();const timer=setInterval(load,30000);return()=>{cancelled=true;clearInterval(timer);};},[id,simulated,patient?.id]);

  const weeklyData = useMemo(() => {
    if (vitalsData.length === 0) return [];
    const avgs = getWeeklyAverages(vitalsData.filter(r=>new Date(r.timestamp).getTime()>=Date.now()-7*86400000));
    return Object.entries(avgs).map(([date, vals]) => ({
      date: date.substring(5),
      ...vals,
    }));
  }, [vitalsData]);

  const monthlyStats = useMemo(() => {
    if (vitalsData.length === 0) return null;
    return getMonthlyAverages(vitalsData);
  }, [vitalsData]);

  const rangePercent=vitalsData.length?(100*vitalsData.filter(r=>r.heart_rate>=55&&r.heart_rate<=100).length/vitalsData.length).toFixed(1):'0';
  const sortedDays=Object.entries(getWeeklyAverages(vitalsData));
  const bpChange=sortedDays.length>1?Math.round((sortedDays.at(-1)?.[1].avg_bp || 0)-(sortedDays[0]?.[1].avg_bp || 0)):0;

  if (loading) {
    return <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-teal border-t-transparent rounded-full animate-spin" />
    </div>;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{simulated ? '30-day overview' : 'Recorded readings for this patient only.'}</p>
      <Tabs defaultValue="weekly">
        <TabsList className="bg-muted rounded-xl">
          <TabsTrigger value="weekly" className="rounded-lg">Weekly Data</TabsTrigger>
          <TabsTrigger value="monthly" className="rounded-lg">Monthly Data</TabsTrigger>
        </TabsList>

        <TabsContent value="weekly" className="space-y-4 mt-4">
          <Card className="rounded-xl">
            <CardContent className="p-4">
              <h3 className="font-display text-lg text-foreground mb-4 flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-teal" /> Weekly Heart Rate Averages
              </h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis domain={[55, 85]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                    <Bar dataKey="avg_hr" fill="#00B4A6" radius={[6, 6, 0, 0]} name="Avg HR (bpm)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-xl">
            <CardContent className="p-4">
              <h3 className="font-display text-lg text-foreground mb-4">Weekly Blood Pressure Trend</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={weeklyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis domain={[110, 145]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                    <Line type="monotone" dataKey="avg_bp" stroke="#E53E3E" strokeWidth={2} dot={{ fill: '#E53E3E', r: 3 }} name="Avg Systolic BP" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {weeklyData.map(d => (
              <Card key={d.date} className="rounded-xl">
                <CardContent className="p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">{d.date}</p>
                  <p className="text-lg font-bold text-foreground">{d.avg_hr} <span className="text-xs text-muted-foreground">bpm</span></p>
                  <p className="text-xs text-muted-foreground">{d.total_steps} steps</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="monthly" className="space-y-4 mt-4">
          {monthlyStats && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                  { label: 'Avg Heart Rate', value: `${monthlyStats.avg_hr} bpm`, color: 'text-teal' },
                  { label: 'Avg Blood Pressure', value: `${monthlyStats.avg_bp_sys}/${monthlyStats.avg_bp_dia}`, color: 'text-destructive' },
                  { label: 'Avg SpO₂', value: `${monthlyStats.avg_spo2}%`, color: 'text-blue-500' },
                  { label: 'Total Steps', value: monthlyStats.total_steps.toLocaleString(), color: 'text-gw-green' },
                ].map(s => (
                  <Card key={s.label} className="rounded-xl">
                    <CardContent className="p-4 text-center">
                      <p className="text-xs text-muted-foreground mb-1">{s.label}</p>
                      <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="rounded-xl">
                <CardContent className="p-4">
                  <h3 className="font-display text-lg text-foreground mb-3">Monthly Health Summary</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-gw-green" />
                      <span className="text-foreground">Heart rate between 55-100 bpm for {rangePercent}% of available readings</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-gw-amber" />
                      <span className="text-foreground">Average systolic BP change from first to last available day: {bpChange > 0 ? '+' : ''}{bpChange} mmHg</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-gw-green" />
                      <span className="text-foreground">Average SpO₂: {monthlyStats.avg_spo2}% across available readings</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {monthlyStats.fall_count > 0 ? (
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                      ) : (
                        <CheckCircle className="h-4 w-4 text-gw-green" />
                      )}
                      <span className="text-foreground">{monthlyStats.fall_count} fall event(s) detected, {monthlyStats.panic_count} panic event(s)</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default LogsTab;
