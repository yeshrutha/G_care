import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useAppStore } from '@/store';
import { useGuardianStore, type GuardianUser } from '@/store/guardianStore';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/hooks/use-toast';
import { apiFetch, storeSession, type AuthUser } from '@/lib/api';
import { broadcastGcareMessage } from '@/lib/syncChannel';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, User, Bell, Phone, Globe, Shield, Trash2, CheckCircle2, AlertTriangle, AlertCircle } from 'lucide-react';

const Settings: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { authUser, setAuthUser, activeAlerts, clearAlerts: appClearAlerts, removeAlert: appRemoveAlert } = useAppStore();
  const { guardianUser, setGuardianUser, alerts: guardianAlerts, clearAlerts: guardianClearAlerts, removeAlert: guardianRemoveAlert } = useGuardianStore();
  const { user } = useAuthStore();

  const isDoctor = user?.role === 'doctor';
  const isCaretaker = user?.role === 'caretaker';
  const isGuardian = user?.role === 'guardian' || (!isDoctor && !isCaretaker);

  const [contacts,setContacts]=useState<NonNullable<GuardianUser['emergencyContacts']>>([]);
  const [savingContacts,setSavingContacts]=useState(false);
  useEffect(()=>{setContacts((user?.profile as any)?.emergencyContacts || []);},[user?.id]);
  const [fontSize,setFontSize]=useState(()=>localStorage.getItem('gcare_font_size')||'Medium');
  const [contrast,setContrast]=useState(()=>localStorage.getItem('gcare_contrast')==='true');
  useEffect(()=>{document.documentElement.style.fontSize=({Small:'14px',Medium:'16px',Large:'18px',XL:'20px'} as Record<string,string>)[fontSize];localStorage.setItem('gcare_font_size',fontSize);},[fontSize]);
  useEffect(()=>{document.documentElement.classList.toggle('high-contrast',contrast);localStorage.setItem('gcare_contrast',String(contrast));},[contrast]);
  const [clearingAlerts, setClearingAlerts] = useState(false);
  const [confirmClearAllOpen, setConfirmClearAllOpen] = useState(false);

  const [profileForm, setProfileForm] = useState<GuardianUser>({
    name: '',
    email: '',
    phone: '',
    elderName: '',
    elderAge: '',
    elderLanguage: '',
    elderConditions: '',
    elderPhone: '',
    elderAddress: '',
    emergencyContacts: [],
  });

  useEffect(() => {
    if (isDoctor) {
      setProfileForm({
        name: user?.name || 'Dr. Ramesh Kumar',
        email: user?.email || 'dr.ramesh@apollo.in',
        phone: user?.phone || '+91 98765 12345',
        elderName: '',
        elderAge: '',
        elderLanguage: '',
        elderConditions: '',
        elderPhone: '',
        elderAddress: '',
        emergencyContacts: [],
      });
    } else if (isCaretaker) {
      setProfileForm({
        name: user?.name || 'Caregiver User',
        email: user?.email || 'caregiver@gcare.in',
        phone: user?.phone || '+91 98765 54321',
        elderName: '',
        elderAge: '',
        elderLanguage: '',
        elderConditions: '',
        elderPhone: '',
        elderAddress: '',
        emergencyContacts: [],
      });
    } else {
      setProfileForm({
        name: guardianUser?.name || user?.name || 'Guardian User',
        email: guardianUser?.email || user?.email || 'guardian@example.com',
        phone: guardianUser?.phone || user?.phone || '+91 98765 43210',
        elderName: guardianUser?.elderName || '',
        elderAge: guardianUser?.elderAge || '',
        elderLanguage: guardianUser?.elderLanguage || '',
        elderConditions: guardianUser?.elderConditions || '',
        elderPhone: guardianUser?.elderPhone || '',
        elderAddress: guardianUser?.elderAddress || '',
        emergencyContacts: guardianUser?.emergencyContacts || [],
      });
    }
  }, [user, guardianUser, isDoctor, isCaretaker]);

  // Unified list of all stored alerts for the alert history section
  const unifiedAlerts = useMemo(() => {
    const list: Array<{
      id: string;
      elderName: string;
      title: string;
      message: string;
      severity: string;
      resolved: boolean;
      time: string;
      source: 'clinical' | 'guardian';
    }> = [];

    const seenIds = new Set<string>();

    activeAlerts.forEach((a) => {
      seenIds.add(a.id);
      list.push({
        id: a.id,
        elderName: a.elder_name || 'Patient',
        title: a.title || 'Telemetry Alert',
        message: a.message,
        severity: a.severity || 'warning',
        resolved: Boolean(a.resolved),
        time: a.timestamp,
        source: 'clinical',
      });
    });

    guardianAlerts.forEach((g) => {
      if (!seenIds.has(g.id)) {
        seenIds.add(g.id);
        list.push({
          id: g.id,
          elderName: g.elderName || 'Patient',
          title: g.type ? g.type.replace(/_/g, ' ').toUpperCase() : 'Guardian Alert',
          message: g.message,
          severity: g.severity || 'warning',
          resolved: Boolean(g.acknowledged),
          time: g.time,
          source: 'guardian',
        });
      }
    });

    return list.sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime());
  }, [activeAlerts, guardianAlerts]);

  const totalCount = unifiedAlerts.length;
  const unresolvedCount = unifiedAlerts.filter((a) => !a.resolved).length;
  const resolvedCount = unifiedAlerts.filter((a) => a.resolved).length;

  const handleClearAlertHistory = async (mode: 'all' | 'resolved' = 'all') => {
    setClearingAlerts(true);
    try {
      appClearAlerts(mode);
      guardianClearAlerts(mode);

      try {
        await apiFetch(`/alerts${mode === 'resolved' ? '?resolved=true' : ''}`, { method: 'DELETE' });
      } catch (err) {
        console.warn('Backend DELETE /api/alerts notice:', err);
      }

      broadcastGcareMessage({
        type: 'ALERTS_CLEARED',
        mode,
        timestamp: Date.now(),
      });

      toast({
        title: mode === 'resolved' ? 'Resolved Alerts Cleared' : 'Alert History Cleared',
        description: mode === 'resolved'
          ? 'Cleared all resolved and acknowledged alerts.'
          : 'All alert records have been permanently cleared from storage and server.',
      });
    } finally {
      setClearingAlerts(false);
      setConfirmClearAllOpen(false);
    }
  };

  const handleRemoveSingleAlert = async (id: string) => {
    appRemoveAlert(id);
    guardianRemoveAlert(id);
    try {
      await apiFetch(`/alerts/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Backend DELETE single alert notice:', err);
    }

    broadcastGcareMessage({
      type: 'ALERTS_CLEARED',
      mode: 'all',
      timestamp: Date.now(),
    });

    toast({
      title: 'Alert Removed',
      description: 'The alert was removed from history.',
    });
  };

  const [savingProfile, setSavingProfile] = useState(false);
  const saveProfile = async () => {
    if (!user || savingProfile) return;
    setSavingProfile(true);
    try {
      const { user: saved } = await apiFetch<{ user: AuthUser }>('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({
          name: profileForm.name.trim(), phone: profileForm.phone.trim(),
          profile: isGuardian ? {
            elderName: profileForm.elderName.trim(), elderAge: profileForm.elderAge || '',
            elderLanguage: profileForm.elderLanguage || '', elderConditions: profileForm.elderConditions || '',
            elderPhone: profileForm.elderPhone || '', elderAddress: profileForm.elderAddress || '',
          } : {},
        }),
      });
      const token = useAuthStore.getState().token;
      if (token) storeSession(token, saved);
      useAuthStore.setState({ user: saved });
      useAuthStore.getState().syncLegacyStores(saved);
      toast({ title: 'Profile updated', description: 'Your changes have been saved to your account.' });
    } catch (error) {
      toast({ title: 'Could not save profile', description: error instanceof Error ? error.message : 'Please try again.', variant: 'destructive' });
    } finally { setSavingProfile(false); }
  };

  const handleBackNavigation = () => {
    if (user?.role === 'doctor') {
      navigate('/doctor');
    } else if (user?.role === 'guardian') {
      navigate('/guardian/dashboard');
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="sticky top-0 z-40 bg-card border-b border-border px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={handleBackNavigation} className="p-1 rounded-md hover:bg-muted transition-colors">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <h1 className="font-display text-2xl text-foreground">{t('nav.settings')}</h1>
        </div>

      </div>

      <div className="max-w-3xl mx-auto p-6">
        <Tabs defaultValue="profile">
          <TabsList className="w-full flex flex-wrap justify-start h-auto gap-2 p-1 bg-muted/60">
            <TabsTrigger value="profile" className="gap-1.5 flex-none shrink-0 px-3"><User className="h-3.5 w-3.5" /> {t('settings.profile')}</TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1.5 flex-none shrink-0 px-3"><Bell className="h-3.5 w-3.5" /> {t('settings.notifications')}</TabsTrigger>
            <TabsTrigger value="alerts" className="gap-1.5 flex-none shrink-0 px-3 font-medium text-rose-600 dark:text-rose-400 data-[state=active]:text-rose-600">
              <Trash2 className="h-3.5 w-3.5" />
              <span>{t('settings.alert_history', 'Alert History')}</span>
              {totalCount > 0 && (
                <Badge variant={unresolvedCount > 0 ? "destructive" : "secondary"} className="ml-1 text-[10px] px-1.5 py-0 h-4">
                  {totalCount}
                </Badge>
              )}
            </TabsTrigger>
            {isGuardian && (
              <TabsTrigger value="contacts" className="gap-1.5 flex-none shrink-0 px-3"><Phone className="h-3.5 w-3.5" /> {t('settings.emergency_contacts')}</TabsTrigger>
            )}
            <TabsTrigger value="language" className="gap-1.5 flex-none shrink-0 px-3"><Globe className="h-3.5 w-3.5" /> {t('settings.language_accessibility')}</TabsTrigger>
            <TabsTrigger value="security" className="gap-1.5 flex-none shrink-0 px-3"><Shield className="h-3.5 w-3.5" /> {t('settings.security')}</TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="mt-6 space-y-4">
            <Card className="rounded-xl">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-teal/15 flex items-center justify-center text-teal text-xl font-semibold">
                    {(profileForm.name || 'D')[0]}
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>{t('settings.full_name')}</Label>
                    <Input value={profileForm.name} className="mt-1" onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} />
                  </div>
                  <div>
                    <Label>{t('settings.email')}</Label>
                    <Input type="email" value={profileForm.email} readOnly className="mt-1" onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} />
                  </div>
                  <div>
                    <Label>{t('settings.phone')}</Label>
                    <Input value={profileForm.phone} className="mt-1" onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} />
                  </div>
                  
                  {isGuardian && (
                    <>
                      <div>
                        <Label>{t('settings.elder_name')}</Label>
                        <Input value={profileForm.elderName} className="mt-1" onChange={(e) => setProfileForm({ ...profileForm, elderName: e.target.value })} />
                      </div>
                      <div>
                        <Label>{t('settings.elder_age')}</Label>
                        <Input type="number" value={profileForm.elderAge || ''} className="mt-1" onChange={(e) => setProfileForm({ ...profileForm, elderAge: e.target.value })} />
                      </div>
                      <div>
                        <Label>{t('settings.preferred_language')}</Label>
                        <Input value={profileForm.elderLanguage || ''} className="mt-1" onChange={(e) => setProfileForm({ ...profileForm, elderLanguage: e.target.value })} />
                      </div>
                      <div>
                        <Label>{t('settings.elder_phone')}</Label>
                        <Input value={profileForm.elderPhone || ''} className="mt-1" onChange={(e) => setProfileForm({ ...profileForm, elderPhone: e.target.value })} />
                      </div>
                      <div>
                        <Label>{t('settings.medical_conditions')}</Label>
                        <Input value={profileForm.elderConditions || ''} className="mt-1" onChange={(e) => setProfileForm({ ...profileForm, elderConditions: e.target.value })} />
                      </div>
                      <div className="md:col-span-2">
                        <Label>{t('settings.address')}</Label>
                        <Textarea value={profileForm.elderAddress || ''} className="mt-1" onChange={(e) => setProfileForm({ ...profileForm, elderAddress: e.target.value })} />
                      </div>
                    </>
                  )}
                </div>
                <Button className="bg-teal hover:bg-teal/90 text-primary-foreground" onClick={saveProfile} disabled={savingProfile}>{savingProfile ? 'Saving...' : 'Save Changes'}</Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="mt-6">
            <Card className="rounded-xl">
              <CardContent className="p-6 space-y-4">
                {['SOS Alert', 'Fall Detection', 'High Heart Rate', 'Low SpO₂', 'Missed Medication', 'Geofence Breach', 'Predictive Risk', 'Daily Summary'].map(type => (
                  <div key={type} className="flex items-center justify-between py-2 border-b border-border/50 last:border-0">
                    <span className="text-sm text-foreground">{type}</span>
                    <div className="flex gap-4">
                      <div className="flex items-center gap-1"><Switch defaultChecked /><span className="text-xs text-muted-foreground">Push</span></div>
                      <div className="flex items-center gap-1"><Switch defaultChecked /><span className="text-xs text-muted-foreground">Email</span></div>
                    </div>
                  </div>
                ))}

              </CardContent>
            </Card>
          </TabsContent>

          {/* Alert History Dedicated Tab */}
          <TabsContent value="alerts" className="mt-6 space-y-6">
            <Card className="rounded-xl border-border">
              <CardContent className="p-6 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                      <Trash2 className="h-5 w-5 text-rose-500" />
                      Alert History & Telemetry Storage
                    </h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Manage and permanently purge recorded emergency SOS, vital signs anomalies, and clinical warnings across all portals.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleClearAlertHistory('resolved')}
                      disabled={clearingAlerts || resolvedCount === 0}
                      className="gap-1.5"
                    >
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      Clear Resolved ({resolvedCount})
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setConfirmClearAllOpen(true)}
                      disabled={clearingAlerts || totalCount === 0}
                      className="gap-1.5 font-semibold"
                    >
                      <Trash2 className="h-4 w-4" />
                      Clear All Alert History ({totalCount})
                    </Button>
                  </div>
                </div>

                {/* Metric Summary Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-muted/40 border border-border">
                    <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Total Stored Alerts</div>
                    <div className="text-2xl font-bold text-foreground mt-1">{totalCount}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Device & backend storage</div>
                  </div>
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20">
                    <div className="text-xs text-rose-600 dark:text-rose-400 font-medium uppercase tracking-wider">Active / Unresolved</div>
                    <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">{unresolvedCount}</div>
                    <div className="text-xs text-rose-600/70 dark:text-rose-400/70 mt-0.5">Pending clinical action</div>
                  </div>
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium uppercase tracking-wider">Resolved / Handled</div>
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{resolvedCount}</div>
                    <div className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-0.5">Safe to purge</div>
                  </div>
                </div>

                {/* Alert History Stream Preview */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-foreground">Current Alert Records</h3>
                    {totalCount > 0 && (
                      <span className="text-xs text-muted-foreground">Showing {totalCount} alerts</span>
                    )}
                  </div>

                  {totalCount === 0 ? (
                    <div className="p-8 text-center rounded-xl border border-dashed border-border bg-muted/20">
                      <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                      <p className="text-sm font-medium text-foreground">No alerts currently stored</p>
                      <p className="text-xs text-muted-foreground mt-1">Alert history is clean. Any new emergency or anomaly alerts will appear here.</p>
                    </div>
                  ) : (
                    <div className="max-h-96 overflow-y-auto space-y-2 pr-1">
                      {unifiedAlerts.map((alert) => (
                        <div
                          key={alert.id}
                          className={`p-3 rounded-lg border text-sm flex items-start justify-between gap-3 transition-colors ${
                            alert.resolved
                              ? 'bg-muted/30 border-border opacity-70'
                              : alert.severity === 'critical'
                              ? 'bg-rose-500/10 border-rose-500/30'
                              : 'bg-amber-500/10 border-amber-500/30'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge
                                variant={
                                  alert.resolved
                                    ? 'secondary'
                                    : alert.severity === 'critical'
                                    ? 'destructive'
                                    : 'outline'
                                }
                                className="text-[10px] uppercase font-bold"
                              >
                                {alert.resolved ? 'Resolved' : alert.severity}
                              </Badge>
                              <span className="font-semibold text-foreground">{alert.elderName}</span>
                              <span className="text-xs text-muted-foreground">
                                {alert.time ? new Date(alert.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''}
                              </span>
                            </div>
                            <p className="text-xs font-medium text-foreground mt-1">{alert.title}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{alert.message}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveSingleAlert(alert.id)}
                            className="text-muted-foreground hover:text-destructive h-8 w-8 p-0 shrink-0"
                            title="Delete this alert"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Contacts Tab */}
          {isGuardian && (
            <TabsContent value="contacts" className="mt-6">
              <Card className="rounded-xl">
                <CardContent className="p-6 space-y-4">
                  {contacts.length === 0 && <p className="text-sm text-muted-foreground">{t('settings.no_contacts')}</p>}
                  {contacts.map((c, i) => <div key={c.id} className="grid sm:grid-cols-3 gap-2">
                    <Input aria-label="Contact name" placeholder={t('settings.contact_name')} value={c.name} onChange={e=>setContacts(contacts.map((v,j)=>j===i?{...v,name:e.target.value}:v))}/>
                    <Input aria-label="Contact phone" placeholder={t('settings.contact_phone')} value={c.phone} onChange={e=>setContacts(contacts.map((v,j)=>j===i?{...v,phone:e.target.value}:v))}/>
                    <div className="flex gap-2"><Input aria-label="Relationship" placeholder={t('settings.relationship')} value={c.relation} onChange={e=>setContacts(contacts.map((v,j)=>j===i?{...v,relation:e.target.value}:v))}/><Button variant="outline" onClick={()=>setContacts(contacts.filter((_,j)=>j!==i))}>{t('settings.remove')}</Button></div>
                  </div>)}
                  <Button variant="outline" onClick={()=>setContacts([...contacts,{id:crypto.randomUUID(),name:'',phone:'',relation:'',primary:false}])}>{t('settings.add_contact')}</Button>
                  <Button disabled={savingContacts} onClick={async()=>{
                    if(contacts.some(c=>!c.name.trim()||!c.phone.trim())) { toast({title:t('settings.contact_required'),variant:'destructive'});return; }
                    setSavingContacts(true);
                    try { const {user:saved}=await apiFetch<{user:AuthUser}>('/auth/profile',{method:'PUT',body:JSON.stringify({profile:{emergencyContacts:contacts}})});
                      const token=useAuthStore.getState().token;if(token)storeSession(token,saved);useAuthStore.setState({user:saved});useAuthStore.getState().syncLegacyStores(saved);toast({title:t('settings.contacts_saved')});
                    }catch(error){toast({title:'Could not save contacts',description:error instanceof Error?error.message:'Try again',variant:'destructive'});}finally{setSavingContacts(false);}
                  }}>{t('settings.save_contacts')}</Button>

                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Language & Accessibility Tab */}
          <TabsContent value="language" className="mt-6 space-y-4">
            <Card className="rounded-xl">
              <CardContent className="p-6 space-y-4">
                <div>
                  <Label>{t('settings.app_language')}</Label>
                  <div className="mt-2"><LanguageToggle /></div>
                </div>
                <div>
                  <Label>{t('settings.font_size')}</Label>
                  <div className="flex gap-2 mt-2">
                    {['Small', 'Medium', 'Large', 'XL'].map(s => (
                      <Button key={s} onClick={()=>setFontSize(s)} variant="outline" size="sm" className={s === fontSize ? 'ring-2 ring-teal' : ''}>{s}</Button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label>{t('settings.high_contrast')}</Label>
                  <Switch checked={contrast} onCheckedChange={setContrast} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security & Data Tab */}
          <TabsContent value="security" className="mt-6">
            <Card className="rounded-xl">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3 p-3 bg-gw-green/10 rounded-lg">
                  <Shield className="h-5 w-5 text-gw-green" />
                  <span className="text-sm font-medium text-gw-green">HIPAA Aligned</span>
                </div>

                
                <Button variant="outline">Export My Data</Button>
                <Button variant="destructive" className="w-full">Delete Account</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Confirmation Dialog for Clear All Alert History */}
      <AlertDialog open={confirmClearAllOpen} onOpenChange={setConfirmClearAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Clear All Alert History?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all {totalCount} alert records, vital anomaly notifications, and SOS history from local storage and the server database across all roles. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearingAlerts}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleClearAlertHistory('all')}
              disabled={clearingAlerts}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {clearingAlerts ? 'Clearing...' : 'Yes, Clear All Alerts'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Settings;
