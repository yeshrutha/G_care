import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { LanguageToggle } from '@/components/LanguageToggle';
import { useAppStore } from '@/store';
import { useGuardianStore, type GuardianUser } from '@/store/guardianStore';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, User, Bell, Phone, Globe, Shield } from 'lucide-react';

const Settings: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { authUser, setAuthUser } = useAppStore();
  const { guardianUser, setGuardianUser } = useGuardianStore();
  const { user } = useAuthStore();

  const isDoctor = user?.role === 'doctor';
  const isCaretaker = user?.role === 'caretaker';
  const isGuardian = user?.role === 'guardian' || (!isDoctor && !isCaretaker);

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
      <div className="sticky top-0 z-40 bg-card border-b border-border px-6 py-3 flex items-center gap-4">
        <button onClick={handleBackNavigation}>
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </button>
        <h1 className="font-display text-2xl text-foreground">{t('nav.settings')}</h1>
      </div>

      <div className="max-w-3xl mx-auto p-6">
        <Tabs defaultValue="profile">
          <TabsList className="w-full">
            <TabsTrigger value="profile" className="gap-1.5"><User className="h-3.5 w-3.5" /> {t('settings.profile')}</TabsTrigger>
            <TabsTrigger value="notifications" className="gap-1.5"><Bell className="h-3.5 w-3.5" /> {t('settings.notifications')}</TabsTrigger>
            {isGuardian && (
              <TabsTrigger value="contacts" className="gap-1.5"><Phone className="h-3.5 w-3.5" /> {t('settings.emergency_contacts')}</TabsTrigger>
            )}
            <TabsTrigger value="language" className="gap-1.5"><Globe className="h-3.5 w-3.5" /> {t('settings.language_accessibility')}</TabsTrigger>
            <TabsTrigger value="security" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> {t('settings.security')}</TabsTrigger>
          </TabsList>

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

          <TabsContent value="security" className="mt-6">
            <Card className="rounded-xl">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center gap-3 p-3 bg-gw-green/10 rounded-lg">
                  <Shield className="h-5 w-5 text-gw-green" />
                  <span className="text-sm font-medium text-gw-green">HIPAA Aligned</span>
                </div>
                <div className="flex items-center justify-between"><Label>Two-Factor Authentication</Label><Switch /></div>
                <Button variant="outline">Export My Data</Button>
                <Button variant="destructive" className="w-full">Delete Account</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Settings;
