import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { GuardianLogo } from '@/components/GuardianLogo';
import { useGuardianStore, type EmergencyContact, type GuardianUser } from '@/store/guardianStore';
import { Switch } from '@/components/ui/switch';
import { useAppStore } from '@/store';
import { type DemoEmergencyEvent, getDemoEmergency, subscribeToDemoEmergency } from './demoEmergency';
import { triggerAlert } from '@/lib/audioAlerts';
import { BarChart3, ScrollText, AlertTriangle, Bell, ShieldAlert, Tv, LogOut, User, Pencil, Plus, Trash2 } from 'lucide-react';
import FeedTab from '@/components/guardian/FeedTab';
import LogsTab from '@/components/guardian/LogsTab';
import AlertsTab from '@/components/guardian/AlertsTab';
import RemindersTab from '@/components/guardian/RemindersTab';
import SOSTab from '@/components/guardian/SOSTab';
import SmartTVTab from '@/components/guardian/SmartTVTab';

const TAB_CONFIG = [
  { id: 'feed', label: 'Feed', icon: BarChart3 },
  { id: 'logs', label: 'Logs', icon: ScrollText },
  { id: 'alerts', label: 'Alerts', icon: AlertTriangle },
  { id: 'reminders', label: 'Reminders', icon: Bell },
  { id: 'sos', label: 'SOS', icon: ShieldAlert },
  { id: 'smarttv', label: 'Smart TV', icon: Tv },
];

const GuardianDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { guardianUser, setGuardianUser, activeTab, setActiveTab, alerts } = useGuardianStore();
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState<GuardianUser>(() => ({
    name: guardianUser?.name || 'Guardian User',
    email: guardianUser?.email || 'guardian@example.com',
    phone: guardianUser?.phone || '+91 98765 43210',
    elderName: guardianUser?.elderName || 'Registered elder',
    elderAge: guardianUser?.elderAge || '',
    elderLanguage: guardianUser?.elderLanguage || '',
    elderConditions: guardianUser?.elderConditions || '',
    elderPhone: guardianUser?.elderPhone || '',
    elderAddress: guardianUser?.elderAddress || '',
    emergencyContacts: guardianUser?.emergencyContacts || [],
  }));

  useEffect(() => {
    if (!guardianUser) {
      setGuardianUser({ name: 'Guardian User', email: 'guardian@example.com', phone: '+91 98765 43210', elderName: 'Registered elder' });
    }
  }, []);

  const unresolvedAlerts = alerts.filter(a => !a.acknowledged).length;

  const demoMode = useAppStore((s) => s.demoMode);
  const setDemoMode = useAppStore((s) => s.setDemoMode);
  const [demoEmergency, setDemoEmergency] = useState<DemoEmergencyEvent | null>(getDemoEmergency());

  useEffect(() => {
    return subscribeToDemoEmergency((event) => {
      if (!demoMode) {
        setDemoEmergency(null);
      } else {
        setDemoEmergency(event);
      }
    });
  }, [demoMode]);

  const { addGuardianAlert } = useGuardianStore();

  useEffect(() => {
    if (demoMode && demoEmergency) {
      const exists = alerts.some((a) => a.id === 'demo-sos-usha');
      if (!exists) {
        addGuardianAlert({
          id: 'demo-sos-usha',
          type: 'sos',
          severity: 'critical',
          message: `🚨 EMERGENCY — SOS button pressed on watch for Usha. Fall detected. Location: ${demoEmergency.location}`,
          time: demoEmergency.detectedAt,
          acknowledged: false,
          elderName: demoEmergency.elderName,
        });
        triggerAlert('sos');
      }
    } else {
      const exists = alerts.some((a) => a.id === 'demo-sos-usha');
      if (exists) {
        useGuardianStore.setState((s) => ({
          alerts: s.alerts.filter((a) => a.id !== 'demo-sos-usha'),
        }));
      }
    }
  }, [demoMode, demoEmergency, alerts, addGuardianAlert]);

  const openProfileEditor = () => {
    setProfileForm({
      name: guardianUser?.name || 'Guardian User',
      email: guardianUser?.email || 'guardian@example.com',
      phone: guardianUser?.phone || '+91 98765 43210',
      elderName: guardianUser?.elderName || 'Registered elder',
      elderAge: guardianUser?.elderAge || '',
      elderLanguage: guardianUser?.elderLanguage || '',
      elderConditions: guardianUser?.elderConditions || '',
      elderPhone: guardianUser?.elderPhone || '',
      elderAddress: guardianUser?.elderAddress || '',
      emergencyContacts: guardianUser?.emergencyContacts || [],
    });
    setProfileOpen(true);
  };

  const updateContact = (id: string, updates: Partial<EmergencyContact>) => {
    setProfileForm((current) => ({
      ...current,
      emergencyContacts: (current.emergencyContacts || []).map((contact) =>
        contact.id === id ? { ...contact, ...updates } : contact,
      ),
    }));
  };

  const addContact = () => {
    setProfileForm((current) => ({
      ...current,
      emergencyContacts: [
        ...(current.emergencyContacts || []),
        {
          id: `contact-${Date.now()}`,
          name: '',
          phone: '',
          relation: '',
          primary: !(current.emergencyContacts || []).some((contact) => contact.primary),
        },
      ],
    }));
  };

  const removeContact = (id: string) => {
    setProfileForm((current) => ({
      ...current,
      emergencyContacts: (current.emergencyContacts || []).filter((contact) => contact.id !== id),
    }));
  };

  const saveProfile = () => {
    setGuardianUser({
      ...profileForm,
      elderName: profileForm.elderName.trim() || 'Registered elder',
      emergencyContacts: (profileForm.emergencyContacts || []).filter(
        (contact) => contact.name.trim() || contact.phone.trim(),
      ),
    });
    setProfileOpen(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-card border-b border-border px-4 lg:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GuardianLogo />
          <span className="hidden md:inline font-display text-lg text-foreground">Guardian Portal</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 border border-teal/30 bg-teal/5 px-3 py-1.5 rounded-lg">
            <span className="text-xs text-muted-foreground">Demo Mode</span>
            <Switch checked={demoMode} onCheckedChange={setDemoMode} />
          </div>
          <Badge variant="outline" className="text-xs border-teal/30 text-teal">
            Elder: {guardianUser?.elderName || 'Registered elder'}
          </Badge>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <User className="h-4 w-4" />
            <span className="hidden md:inline">{guardianUser?.name}</span>
          </div>
          <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-teal border-teal/30" onClick={openProfileEditor}>
                <Pencil className="h-4 w-4 mr-1" /> Edit Profile
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-display">Edit Guardian Profile</DialogTitle>
              </DialogHeader>

              <div className="space-y-6">
                <div>
                  <h3 className="font-semibold text-foreground mb-3">Guardian Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="guardian-name">Guardian Name</Label>
                      <Input id="guardian-name" value={profileForm.name} onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="guardian-email">Email</Label>
                      <Input id="guardian-email" type="email" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="guardian-phone">Phone</Label>
                      <Input id="guardian-phone" value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-foreground mb-3">Elder Details</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="elder-name">Elder Name</Label>
                      <Input id="elder-name" value={profileForm.elderName} onChange={(e) => setProfileForm({ ...profileForm, elderName: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="elder-age">Age</Label>
                      <Input id="elder-age" type="number" value={profileForm.elderAge || ''} onChange={(e) => setProfileForm({ ...profileForm, elderAge: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="elder-language">Preferred Language</Label>
                      <Input id="elder-language" placeholder="English, Hindi, Kannada..." value={profileForm.elderLanguage || ''} onChange={(e) => setProfileForm({ ...profileForm, elderLanguage: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="elder-phone">Elder Phone</Label>
                      <Input id="elder-phone" value={profileForm.elderPhone || ''} onChange={(e) => setProfileForm({ ...profileForm, elderPhone: e.target.value })} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="elder-conditions">Medical Conditions</Label>
                      <Input id="elder-conditions" placeholder="Hypertension, Diabetes..." value={profileForm.elderConditions || ''} onChange={(e) => setProfileForm({ ...profileForm, elderConditions: e.target.value })} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="elder-address">Address</Label>
                      <Textarea id="elder-address" value={profileForm.elderAddress || ''} onChange={(e) => setProfileForm({ ...profileForm, elderAddress: e.target.value })} />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-foreground">Emergency Contacts</h3>
                    <Button type="button" variant="outline" size="sm" className="text-teal border-teal/30" onClick={addContact}>
                      <Plus className="h-4 w-4 mr-1" /> Add Contact
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {(profileForm.emergencyContacts || []).length === 0 ? (
                      <Card className="rounded-xl">
                        <CardContent className="p-4 text-sm text-muted-foreground">
                          No emergency contacts added yet.
                        </CardContent>
                      </Card>
                    ) : null}

                    {(profileForm.emergencyContacts || []).map((contact) => (
                      <Card key={contact.id} className="rounded-xl">
                        <CardContent className="p-4 space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="space-y-2">
                              <Label>Name</Label>
                              <Input value={contact.name} onChange={(e) => updateContact(contact.id, { name: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <Label>Phone</Label>
                              <Input value={contact.phone} onChange={(e) => updateContact(contact.id, { phone: e.target.value })} />
                            </div>
                            <div className="space-y-2">
                              <Label>Relation</Label>
                              <Input value={contact.relation} onChange={(e) => updateContact(contact.id, { relation: e.target.value })} />
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`primary-${contact.id}`}
                                checked={contact.primary}
                                onCheckedChange={(checked) => updateContact(contact.id, { primary: checked === true })}
                              />
                              <Label htmlFor={`primary-${contact.id}`} className="text-sm">Primary contact</Label>
                            </div>
                            <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => removeContact(contact.id)}>
                              <Trash2 className="h-4 w-4 mr-1" /> Remove
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                <Button className="w-full bg-teal hover:bg-teal/90 text-primary-foreground rounded-xl" onClick={saveProfile}>
                  Save Profile
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { setGuardianUser(null); navigate('/login'); }}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-4 lg:p-6 max-w-6xl mx-auto w-full">
        {demoMode && demoEmergency && (
          <Card className="rounded-xl border-2 border-destructive bg-destructive/5 shadow-lg mb-6 animate-pulse-border p-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-8 w-8 text-destructive flex-shrink-0 mt-0.5 animate-bounce" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-destructive text-lg">🚨 CRITICAL EMERGENCY: Fall + SOS</h3>
                  <Badge className="bg-destructive text-primary-foreground border-0">CRITICAL</Badge>
                </div>
                <p className="text-sm text-foreground mt-2">
                  <strong>Elder:</strong> {demoEmergency.elderName}
                </p>
                <p className="text-sm text-foreground mt-1">
                  <strong>Event:</strong> Fall Detected & SOS Activated
                </p>
                <p className="text-sm text-foreground mt-1">
                  <strong>Simulated Vitals:</strong> Heart Rate: {demoEmergency.heartRate} BPM | SpO₂: {demoEmergency.spo2}%
                </p>
                <p className="text-sm text-foreground mt-1">
                  <strong>Location:</strong> {demoEmergency.location}
                </p>
                <p className="text-sm text-foreground mt-1">
                  <strong>Time:</strong> {new Date(demoEmergency.detectedAt).toLocaleTimeString()}
                </p>
                <div className="mt-3 p-3 bg-card rounded-lg border border-border">
                  <p className="text-xs text-muted-foreground">Doctor Action Status</p>
                  <p className="text-sm font-semibold text-foreground mt-0.5">
                    {demoEmergency.appointmentStatus === 'confirmed'
                      ? `Appointment Confirmed with ${demoEmergency.doctorName} at ${demoEmergency.hospitalName}`
                      : `Appointment requested with ${demoEmergency.doctorName} (${demoEmergency.hospitalName}) - pending doctor confirmation`}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        )}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-muted rounded-xl mb-6 flex-wrap h-auto gap-1 p-1">
            {TAB_CONFIG.map(tab => (
              <TabsTrigger key={tab.id} value={tab.id} className="rounded-lg text-xs lg:text-sm flex items-center gap-1.5 relative">
                <tab.icon className="h-4 w-4" />
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.id === 'alerts' && unresolvedAlerts > 0 && (
                  <Badge className="bg-destructive text-primary-foreground text-[9px] h-4 min-w-[16px] flex items-center justify-center ml-1 p-0">
                    {unresolvedAlerts}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="feed"><FeedTab /></TabsContent>
          <TabsContent value="logs"><LogsTab /></TabsContent>
          <TabsContent value="alerts"><AlertsTab /></TabsContent>
          <TabsContent value="reminders"><RemindersTab /></TabsContent>
          <TabsContent value="sos"><SOSTab /></TabsContent>
          <TabsContent value="smarttv"><SmartTVTab /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default GuardianDashboard;
