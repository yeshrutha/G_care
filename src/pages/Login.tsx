import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GuardianLogo } from '@/components/GuardianLogo';
import { useAppStore } from '@/store';
import { useGuardianStore } from '@/store/guardianStore';
import { Eye, EyeOff, Heart, Languages, Zap, Shield } from 'lucide-react';

type Role = 'caretaker' | 'doctor' | 'guardian';

const COUNTRY_CODES = [
  { code: '+91', label: '🇮🇳 +91' },
  { code: '+1', label: '🇺🇸 +1' },
  { code: '+44', label: '🇬🇧 +44' },
  { code: '+61', label: '🇦🇺 +61' },
  { code: '+971', label: '🇦🇪 +971' },
  { code: '+65', label: '🇸🇬 +65' },
  { code: '+81', label: '🇯🇵 +81' },
  { code: '+49', label: '🇩🇪 +49' },
];

const Login: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setAuthUser = useAppStore((s) => s.setAuthUser);
  const { setGuardianUser } = useGuardianStore();

  const [isSignup, setIsSignup] = useState(false);
  const [role, setRole] = useState<Role>('caretaker');
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [elderName, setElderName] = useState('');
  const [error, setError] = useState('');

  const getRedirect = (r: Role) => {
    if (r === 'doctor') return '/doctor';
    if (r === 'guardian') return '/guardian/dashboard';
    return '/dashboard';
  };

  const fullPhone = `${countryCode} ${phoneNumber}`;

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('Please fill in all fields'); return; }

    if (role === 'guardian') {
      setGuardianUser({
        name: name || 'Guardian User',
        email,
        phone: fullPhone,
        elderName: elderName || 'Registered elder',
      });
    } else {
      setAuthUser({ id: '1', name: name || 'Demo User', role, email });
    }
    navigate(getRedirect(role));
  };

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password) { setError('Please fill in all fields'); return; }

    if (role === 'guardian') {
      setGuardianUser({ name, email, phone: fullPhone, elderName: elderName || '' });
    } else {
      setAuthUser({ id: '1', name, role, email });
    }
    navigate(getRedirect(role));
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex w-[40%] bg-teal flex-col justify-center items-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" viewBox="0 0 400 600">
            {Array.from({length: 5}, (_, i) => (
              <path key={i} d={`M0 ${100+i*120}h100l20-40 40 80 30-50h210`} fill="none" stroke="#fff" strokeWidth="1" opacity={0.3+i*0.1} />
            ))}
          </svg>
        </div>
        <div className="relative z-10 text-center">
          <GuardianLogo white className="justify-center mb-8" />
          <p className="font-display text-3xl text-primary-foreground mb-12">{t('login.tagline')}</p>
          <div className="space-y-4">
            {[
              { icon: Heart, label: t('login.stat_vitals') },
              { icon: Languages, label: t('login.stat_languages') },
              { icon: Zap, label: t('login.stat_alerts') },
              { icon: Shield, label: 'Guardian Portal' },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-3 text-primary-foreground/90">
                <div className="w-8 h-8 rounded-lg bg-primary-foreground/20 flex items-center justify-center">
                  <s.icon className="h-4 w-4" />
                </div>
                <span className="font-medium">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8 bg-card">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8">
            <GuardianLogo />
          </div>

          <Tabs value={role} onValueChange={(v) => { setRole(v as Role); setError(''); }} className="mb-6">
            <TabsList className="w-full">
              <TabsTrigger value="caretaker" className="flex-1">{t('login.caretaker')}</TabsTrigger>
              <TabsTrigger value="doctor" className="flex-1">{t('login.doctor_tab')}</TabsTrigger>
              <TabsTrigger value="guardian" className="flex-1 flex items-center gap-1">
                <Shield className="h-3.5 w-3.5" /> Guardian
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <h2 className="font-display text-2xl text-foreground mb-2">
            {isSignup ? t('login.create_account') : t('login.welcome')}
          </h2>
          {role === 'guardian' && (
            <p className="text-sm text-muted-foreground mb-4">
              Monitor, protect, and care for your loved ones in real time.
            </p>
          )}

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
          )}

          <form onSubmit={isSignup ? handleSignup : handleLogin} className="space-y-4">
            {isSignup && (
              <div>
                <Label htmlFor="name">{t('login.full_name')}</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
              </div>
            )}

            <div>
              <Label htmlFor="email">{t('login.email')}</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
            </div>

            <div>
              <Label htmlFor="password">{t('login.password')}</Label>
              <div className="relative mt-1">
                <Input id="password" type={showPassword ? 'text' : 'password'}
                  value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Caretaker signup fields */}
            {isSignup && role === 'caretaker' && (
              <>
                <div>
                  <Label htmlFor="phone">{t('login.phone')}</Label>
                  <div className="flex gap-2 mt-1">
                    <Select value={countryCode} onValueChange={setCountryCode}>
                      <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COUNTRY_CODES.map(c => (
                          <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input id="phone" type="tel" placeholder="98765 43210" className="flex-1"
                      value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d\s]/g, ''))} />
                  </div>
                </div>
                <div>
                  <Label htmlFor="relationship">{t('login.relationship')}</Label>
                  <Select>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {['Son', 'Daughter', 'Spouse', 'Nurse', 'Doctor', 'Other'].map(r => (
                        <SelectItem key={r} value={r.toLowerCase()}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="hipaa" />
                  <Label htmlFor="hipaa" className="text-sm text-muted-foreground">{t('login.hipaa_consent')}</Label>
                </div>
              </>
            )}

            {/* Doctor signup fields */}
            {isSignup && role === 'doctor' && (
              <>
                <div>
                  <Label htmlFor="medreg">{t('login.med_reg')}</Label>
                  <Input id="medreg" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="hospital">{t('login.hospital')}</Label>
                  <Input id="hospital" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="spec">{t('login.specialization')}</Label>
                  <Input id="spec" className="mt-1" />
                </div>
              </>
            )}

            {/* Guardian-specific fields */}
            {role === 'guardian' && (
              <>
                {isSignup && (
                  <div>
                    <Label htmlFor="g-phone">Phone Number</Label>
                    <div className="flex gap-2 mt-1">
                      <Select value={countryCode} onValueChange={setCountryCode}>
                        <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {COUNTRY_CODES.map(c => (
                            <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input id="g-phone" type="tel" placeholder="98765 43210" className="flex-1"
                        value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value.replace(/[^\d\s]/g, ''))} />
                    </div>
                  </div>
                )}
                <div>
                  <Label htmlFor="g-elder">Elder's Name</Label>
                  <Input id="g-elder" placeholder="Name of elder you're caring for" value={elderName}
                    onChange={(e) => setElderName(e.target.value)} className="mt-1" />
                </div>
              </>
            )}

            {!isSignup && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox id="remember" />
                  <Label htmlFor="remember" className="text-sm">{t('login.remember')}</Label>
                </div>
                <button type="button" className="text-sm text-teal hover:underline">{t('login.forgot')}</button>
              </div>
            )}

            <Button type="submit" className="w-full h-11 bg-teal hover:bg-teal/90 text-primary-foreground rounded-lg">
              {isSignup
                ? (role === 'doctor' ? t('login.request_access') : t('login.create_account'))
                : t('login.login_btn')}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            {isSignup ? t('login.login_prompt') : t('login.signup_prompt')}{' '}
            <button onClick={() => { setIsSignup(!isSignup); setError(''); }}
              className="text-teal hover:underline font-medium">
              {isSignup ? t('login.login_link') : t('login.signup_link')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;
