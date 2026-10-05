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
import { apiFetch } from '@/lib/api';
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
        elderName: guardianUser?.elderName || 'Usha',
        elderAge: guardianUser?.elderAge || '78',
        elderLanguage: guardianUser?.elderLanguage || 'Kannada',
        elderConditions: guardianUser?.elderConditions || 'Hypertension, Diabetes',
        elderPhone: guardianUser?.elderPhone || '+91 98765 00000',
        elderAddress: guardianUser?.elderAddress || 'Sadashivanagar, Bangalore',
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

  const saveProfile = () => {
    if (isDoctor || isCaretaker) {
      if (user) {
        useAuthStore.setState({
          user: {
            ...user,
            name: profileForm.name.trim(),
            email: profileForm.email.trim(),
            phone: profileForm.phone.trim(),
          }
        });
      }
      toast({
        title: 'Profile updated',
        description: 'Your profile changes have been saved.',
      });
    } else {
      const nextGuardianUser: GuardianUser = {
        ...guardianUser,
        name: profileForm.name.trim() || 'Guardian User',
        email: profileForm.email.trim() || 'guardian@example.com',
        phone: profileForm.phone.trim() || '+91 98765 43210',
        elderName: profileForm.elderName.trim() || 'Registered elder',
        elderAge: profileForm.elderAge,
        elderLanguage: profileForm.elderLanguage,
        elderConditions: profileForm.elderConditions,
        elderPhone: profileForm.elderPhone,
        elderAddress: profileForm.elderAddress,
      };

      setGuardianUser(nextGuardianUser);
      if (user) {
        useAuthStore.setState({
          user: {
            ...user,
            name: nextGuardianUser.name,
            email: nextGuardianUser.email,
            phone: nextGuardianUser.phone,
            profile: {
              ...user.profile,
              elderName: nextGuardianUser.elderName,
              elderAge: nextGuardianUser.elderAge,
              elderLanguage: nextGuardianUser.elderLanguage,
              elderConditions: nextGuardianUser.elderConditions,
              elderPhone: nextGuardianUser.elderPhone,
              elderAddress: nextGuardianUser.elderAddress,
            }
          }
        });
      }

      toast({
        title: 'Profile updated',
        description: 'Your guardian profile changes have been saved.',
      });
    }
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

        {/* Quick Header Clear History Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirmClearAllOpen(true)}
          disabled={clearingAlerts || totalCount === 0}
          className="border-rose-500/40 text-rose-600 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400 gap-1.5"
          title="Clear all alerts across portals"
        >
          <Trash2 className="h-4 w-4" />
          <span className="hidden sm:inline">Clear Alert History</span>
          {totalCount > 0 && (
            <Badge variant={unresolvedCount > 0 ? 'destructive' : 'secondary'} className="ml-1 text-[10px] px-1.5 py-0 h-4">
              {totalCount}
            </Badge>
          )}
        </Button>
      </div>

      <div className="max-w-3xl mx-auto p-6">
        <Tabs defaultValue="profile">
          <TabsList className="w-full flex flex-wrap h-auto gap-1 p-1 bg-muted/60">
            <TabsTrigger value="profile" className="gap-1.5 flex-1 min-w-[110px]"><User className="h-3.5 w-3.5" /> {t('settings.profile')}</TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1.5 flex-1 min-w-[110px]"><Bell className="h-3.5 w-3.5" /> {t('settings.notifications')}</TabsTrigger>
            <TabsTrigger value="alerts" className="gap-1.5 flex-1 min-w-[130px] font-medium text-rose-600 dark:text-rose-400 data-[state=active]:text-rose-600">
              <Trash2 className="h-3.5 w-3.5" />
              <span>{t('settings.alert_history', 'Alert History')}</span>
              {totalCount > 0 && (
                <Badge variant={unresolvedCount > 0 ? "destructive" : "secondary"} className="ml-1 text-[10px] px-1.5 py-0 h-4">
                  {totalCount}
                </Badge>
              )}
            </TabsTrigger>
            {isGuardian && (
              <TabsTrigger value="contacts" className="gap-1.5 flex-1 min-w-[110px]"><Phone className="h-3.5 w-3.5" /> {t('settings.emergency_contacts')}</TabsTrigger>
            )}
            <TabsTrigger value="language" className="gap-1.5 flex-1 min-w-[110px]"><Globe className="h-3.5 w-3.5" /> {t('settings.language_accessibility')}</TabsTrigger>
            <TabsTrigger value="security" className="gap-1.5 flex-1 min-w-[110px]"><Shield className="h-3.5 w-3.5" /> {t('settings.security')}</TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="mt-6 space-y-4">
            <Card className="rounded-xl">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-teal/15 flex items-center justify-center text-teal text-xl font-semibold">
                    {(profileForm.name || 'D')[0]}
                  </div>
                  <Button variant="outline" size="sm">Change Photo</Button>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Full Name</Label>
                    <Input value={profileForm.name} className="mt-1" onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={profileForm.email} className="mt-1" onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input value={profileForm.phone} className="mt-1" onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} />
                  </div>
                  
                  {isGuardian && (
                    <>
                      <div>
                        <Label>Elder Name</Label>
                        <Input value={profileForm.elderName} className="mt-1" onChange={(e) => setProfileForm({ ...profileForm, elderName: e.target.value })} />
                      </div>
                      <div>
                        <Label>Elder Age</Label>
                        <Input type="number" value={profileForm.elderAge || ''} className="mt-1" onChange={(e) => setProfileForm({ ...profileForm, elderAge: e.target.value })} />
                      </div>
                      <div>
                        <Label>Preferred Language</Label>
                        <Input value={profileForm.elderLanguage || ''} className="mt-1" onChange={(e) => setProfileForm({ ...profileForm, elderLanguage: e.target.value })} />
                      </div>
                      <div>
                        <Label>Elder Phone</Label>
                        <Input value={profileForm.elderPhone || ''} className="mt-1" onChange={(e) => setProfileForm({ ...profileForm, elderPhone: e.target.value })} />
                      </div>
                      <div>
                        <Label>Medical Conditions</Label>
                        <Input value={profileForm.elderConditions || ''} className="mt-1" onChange={(e) => setProfileForm({ ...profileForm, elderConditions: e.target.value })} />
                      </div>
                      <div className="md:col-span-2">
                        <Label>Address</Label>
                        <Textarea value={profileForm.elderAddress || ''} className="mt-1" onChange={(e) => setProfileForm({ ...profileForm, elderAddress: e.target.value })} />
                      </div>
                    </>
                  )}
                </div>
                <Button className="bg-teal hover:bg-teal/90 text-primary-foreground" onClick={saveProfile}>Save Changes</Button>
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

                {/* Direct Clear Alert History Box in Notifications Tab */}
                <div className="pt-4 border-t border-border">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-muted/40 border border-border">
                    <div>
                      <div className="flex items-center gap-2 font-medium text-foreground text-sm">
                        <Trash2 className="h-4 w-4 text-rose-500" />
                        <span>Alert History & Notification Cleanup</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Currently storing {totalCount} alert(s) ({unresolvedCount} active, {resolvedCount} resolved).
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleClearAlertHistory('resolved')}
                        disabled={clearingAlerts || resolvedCount === 0}
                      >
                        Clear Resolved
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setConfirmClearAllOpen(true)}
                        disabled={clearingAlerts || totalCount === 0}
                        className="gap-1.5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Clear All History
                      </Button>
                    </div>
                  </div>
                </div>
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
                  {[
                    { name: 'Priya Sharma', phone: '+91 98765 43210', rel: 'Daughter' },
                    { name: 'Dr. Ramesh Kumar', phone: '+91 98765 12345', rel: 'Doctor' },
                  ].map((c, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-foreground">{c.name}</p>
                        <p className="text-xs text-muted-foreground">{c.phone} · {c.rel}</p>
                      </div>
                      <Button size="sm" variant="outline">Test Alert</Button>
                    </div>
                  ))}
                  <Button variant="outline" className="w-full border-dashed">+ Add Contact</Button>
                </CardContent>
              </Card>
            </TabsContent>
          )}

          {/* Language & Accessibility Tab */}
          <TabsContent value="language" className="mt-6 space-y-4">
            <Card className="rounded-xl">
              <CardContent className="p-6 space-y-4">
                <div>
                  <Label>App Language</Label>
                  <div className="mt-2"><LanguageToggle /></div>
                </div>
                <div>
                  <Label>Font Size</Label>
                  <div className="flex gap-2 mt-2">
                    {['Small', 'Medium', 'Large', 'XL'].map(s => (
                      <Button key={s} variant="outline" size="sm" className={s === 'Medium' ? 'ring-2 ring-teal' : ''}>{s}</Button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <Label>High Contrast Mode</Label>
                  <Switch />
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
                <div className="flex items-center justify-between"><Label>Two-Factor Authentication</Label><Switch /></div>
                
                {/* Alert History Data Purge Section in Security */}
                <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Trash2 className="h-4 w-4 text-destructive" />
                    <span className="text-sm font-semibold text-foreground">Alert History & Telemetry Storage</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Purge all recorded vital sign anomalies, SOS events, and notifications from the local storage cache and database ({totalCount} total alerts).
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleClearAlertHistory('resolved')}
                      disabled={clearingAlerts || resolvedCount === 0}
                    >
                      Clear Resolved ({resolvedCount})
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setConfirmClearAllOpen(true)}
                      disabled={clearingAlerts || totalCount === 0}
                      className="gap-1.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Clear All Alert History
                    </Button>
                  </div>
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
