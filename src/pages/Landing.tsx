import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { GuardianLogo } from '@/components/GuardianLogo';
import WatchSimulator from '@/components/WatchSimulator';
import { Heart, Shield, Bell, Stethoscope, Globe, Pill, ArrowRight, Activity, Clock, Mic, Languages } from 'lucide-react';

const Landing: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const features = [
    { icon: Activity, title: t('features.predictive_title'), desc: t('features.predictive_desc') },
    { icon: Heart, title: t('features.vitals_title'), desc: t('features.vitals_desc') },
    { icon: Pill, title: t('features.medication_title'), desc: t('features.medication_desc') },
    { icon: Bell, title: t('features.emergency_title'), desc: t('features.emergency_desc') },
    { icon: Stethoscope, title: t('features.doctor_title'), desc: t('features.doctor_desc') },
    { icon: Globe, title: t('features.language_title'), desc: t('features.language_desc') },
  ];

  const steps = [
    { num: '1', title: t('how.step1_title'), desc: t('how.step1_desc'), icon: '⌚' },
    { num: '2', title: t('how.step2_title'), desc: t('how.step2_desc'), icon: '⚙️' },
    { num: '3', title: t('how.step3_title'), desc: t('how.step3_desc'), icon: '🤖' },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-card shadow-sm border-b border-border">
        <div className="container mx-auto flex items-center justify-between h-16 px-4">
          <GuardianLogo />
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">{t('nav.features')}</a>
            <a href="#how" className="hover:text-foreground transition-colors">{t('nav.how_it_works')}</a>
            <a href="#doctors" className="hover:text-foreground transition-colors">{t('nav.for_doctors')}</a>
          </nav>
          <div className="flex items-center gap-3">
            <WatchSimulator buttonClassName="hidden sm:inline-flex" />
            <Button variant="ghost" onClick={() => navigate('/login')}>{t('nav.login')}</Button>
            <Button className="bg-teal hover:bg-teal/90 text-primary-foreground rounded-lg" onClick={() => navigate('/login')}>
              {t('nav.start_free')}
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 py-20 md:py-28">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl text-navy leading-tight mb-6">
            {t('hero.title_1')}<br />{t('hero.title_2')}
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            {t('hero.subtitle')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <WatchSimulator buttonVariant="secondary" buttonClassName="w-full sm:hidden rounded-lg h-12 px-8 text-base bg-secondary text-navy hover:bg-secondary/80" />
            <Button size="lg" className="bg-teal hover:bg-teal/90 text-primary-foreground rounded-lg h-12 px-8 text-base" onClick={() => navigate('/login')}>
              {t('hero.cta_trial')}
            </Button>
            <Button size="lg" variant="outline" className="rounded-lg h-12 px-8 text-base border-border" onClick={() => navigate('/dashboard')}>
              {t('hero.cta_demo')} <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Hero visual */}
        <div className="mt-16 flex justify-center">
          <div className="relative">
            <div className="w-20 h-28 rounded-2xl bg-navy flex items-center justify-center shadow-lg">
              <svg viewBox="0 0 40 40" className="w-10 h-10">
                <path d="M5 20h8l3-8 6 16 4-10h9" fill="none" stroke="#00B4A6" strokeWidth="2" strokeLinecap="round">
                  <animate attributeName="stroke-dashoffset" from="60" to="0" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="stroke-dasharray" values="0,60;60,0" dur="2s" repeatCount="indefinite" />
                </path>
              </svg>
            </div>
            <div className="hidden md:block absolute top-1/2 left-24 w-32 border-t-2 border-dashed border-teal" />
            <div className="hidden md:block absolute top-6 left-60 w-48 h-32 rounded-xl bg-card shadow-lg border border-border p-3">
              <div className="text-[10px] font-medium text-navy mb-2">Live Dashboard</div>
              <div className="space-y-1.5">
                {[
                  { color: 'bg-gw-green', text: 'HR: 68 bpm' },
                  { color: 'bg-gw-green', text: 'BP: 126/82' },
                  { color: 'bg-gw-green', text: 'SpO₂: 97%' },
                  { color: 'bg-gw-amber', text: 'Stress: 45' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${item.color}`} />
                    <span className="text-[9px] text-muted-foreground">{item.text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="bg-card py-20 border-y border-border">
        <div className="container mx-auto px-4">
          <h2 className="font-display text-3xl md:text-4xl text-navy text-center mb-4">Everything Your Family Needs</h2>
          <p className="text-muted-foreground text-center mb-12 max-w-xl mx-auto">Comprehensive health monitoring built for Indian families caring for ageing loved ones.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <Card key={i} className="rounded-xl border-border shadow-sm hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center mb-4">
                    <f.icon className="h-5 w-5 text-teal" />
                  </div>
                  <h3 className="font-display text-lg text-foreground mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="py-20">
        <div className="container mx-auto px-4">
          <h2 className="font-display text-3xl md:text-4xl text-navy text-center mb-12">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {steps.map((s, i) => (
              <div key={i} className="text-center">
                <div className="text-4xl mb-4">{s.icon}</div>
                <div className="w-10 h-10 rounded-full bg-teal text-primary-foreground font-semibold flex items-center justify-center mx-auto mb-3">{s.num}</div>
                <h3 className="font-display text-lg text-foreground mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="bg-navy py-8">
        <div className="container mx-auto px-4 flex flex-wrap items-center justify-center gap-8 md:gap-16">
          {[
            { icon: Heart, label: t('stats.vitals') },
            { icon: Clock, label: t('stats.alerts') },
            { icon: Mic, label: t('stats.voices') },
            { icon: Languages, label: t('stats.languages') },
          ].map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <s.icon className="h-5 w-5 text-teal" />
              <span className="font-semibold text-primary-foreground">{s.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 bg-card">
        <div className="container mx-auto px-4">
          <h2 className="font-display text-3xl md:text-4xl text-navy text-center mb-12">Trusted by Families Across India</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              { name: t('testimonials.t1_name'), role: t('testimonials.t1_role'), text: t('testimonials.t1_text') },
              { name: t('testimonials.t2_name'), role: t('testimonials.t2_role'), text: t('testimonials.t2_text') },
              { name: t('testimonials.t3_name'), role: t('testimonials.t3_role'), text: t('testimonials.t3_text') },
            ].map((tm, i) => (
              <Card key={i} className="rounded-xl border-border">
                <CardContent className="p-6">
                  <p className="text-sm text-muted-foreground italic mb-4 leading-relaxed">"{tm.text}"</p>
                  <div>
                    <p className="font-semibold text-foreground text-sm">{tm.name}</p>
                    <p className="text-xs text-muted-foreground">{tm.role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-navy py-10 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <GuardianLogo white />
              <span className="text-sm text-primary-foreground/70">{t('footer.tagline')}</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-primary-foreground/60">
              <a href="#" className="hover:text-primary-foreground">{t('footer.privacy')}</a>
              <a href="#" className="hover:text-primary-foreground">{t('footer.terms')}</a>
              <a href="#" className="hover:text-primary-foreground">{t('footer.hipaa')}</a>
              <a href="#" className="hover:text-primary-foreground">{t('footer.contact')}</a>
            </div>
          </div>
          <p className="text-center text-xs text-primary-foreground/40 mt-6">{t('footer.copyright')}</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
