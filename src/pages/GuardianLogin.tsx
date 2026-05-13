import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GuardianLogo } from '@/components/GuardianLogo';
import { Shield, Eye, EyeOff, Heart, Activity, Bell } from 'lucide-react';
import { useGuardianStore } from '@/store/guardianStore';

const GuardianLogin: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setGuardianUser } = useGuardianStore();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', name: '', phone: '', elderName: '' });
  const [isSignup, setIsSignup] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.email || !form.password) {
      setError('Please fill in all fields');
      return;
    }
    setGuardianUser({
      name: form.name || 'Guardian User',
      email: form.email,
      phone: form.phone || '+91 98765 43210',
      elderName: form.elderName || 'Registered elder',
    });
    navigate('/guardian/dashboard');
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel */}
      <div className="hidden lg:flex w-[45%] bg-gradient-to-br from-navy to-[hsl(215,60%,25%)] flex-col justify-center items-center p-12 text-primary-foreground relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          {Array.from({ length: 20 }).map((_, i) => (
            <div key={i} className="absolute rounded-full bg-primary-foreground" style={{
              width: `${Math.random() * 100 + 50}px`, height: `${Math.random() * 100 + 50}px`,
              left: `${Math.random() * 100}%`, top: `${Math.random() * 100}%`, opacity: Math.random() * 0.3,
            }} />
          ))}
        </div>
        <div className="relative z-10 text-center space-y-8">
          <div className="flex justify-center">
            <div className="w-20 h-20 rounded-2xl bg-primary-foreground/10 backdrop-blur flex items-center justify-center">
              <Shield className="w-10 h-10 text-teal" />
            </div>
          </div>
          <h1 className="font-display text-4xl">Guardian Portal</h1>
          <p className="text-xl text-primary-foreground/80 max-w-sm">
            Monitor, protect, and care for your loved ones — every second, every day.
          </p>
          <div className="grid grid-cols-3 gap-6 pt-8">
            {[
              { icon: Heart, label: '24/7 Monitoring', value: '10 vitals' },
              { icon: Activity, label: 'Real-time Alerts', value: '< 3 seconds' },
              { icon: Bell, label: 'Smart Reminders', value: '5 languages' },
            ].map((stat, i) => (
              <div key={i} className="text-center space-y-2">
                <stat.icon className="w-6 h-6 mx-auto text-teal" />
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-primary-foreground/60">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-background">
        <Card className="w-full max-w-md rounded-2xl shadow-lg border-border">
          <CardContent className="p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="lg:hidden flex justify-center mb-4"><GuardianLogo /></div>
              <h2 className="font-display text-2xl text-foreground">
                {isSignup ? 'Create Guardian Account' : 'Guardian Login'}
              </h2>
              <p className="text-sm text-muted-foreground">
                {isSignup ? 'Set up your guardian monitoring account' : 'Sign in to monitor your loved ones'}
              </p>
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              {isSignup && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="g-name">Full Name</Label>
                    <Input id="g-name" placeholder="Your full name" value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="g-phone">Phone Number</Label>
                    <Input id="g-phone" placeholder="+91 98765 43210" value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="g-elder">Elder's Name</Label>
                    <Input id="g-elder" placeholder="Name of elder you're caring for" value={form.elderName}
                      onChange={(e) => setForm({ ...form, elderName: e.target.value })} />
                  </div>
                </>
              )}

              <div className="space-y-2">
                <Label htmlFor="g-email">Email</Label>
                <Input id="g-email" type="email" placeholder="guardian@example.com" value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="g-password">Password</Label>
                <div className="relative">
                  <Input id="g-password" type={showPassword ? 'text' : 'password'} placeholder="••••••••"
                    value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full h-12 bg-teal hover:bg-teal/90 text-primary-foreground rounded-xl text-base font-semibold">
                {isSignup ? 'Create Account' : 'Sign In'}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button className="text-teal font-medium hover:underline" onClick={() => { setIsSignup(!isSignup); setError(''); }}>
                {isSignup ? 'Sign in' : 'Create one'}
              </button>
            </p>

            <div className="text-center">
              <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => navigate('/login')}>
                ← Back to main login
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GuardianLogin;
