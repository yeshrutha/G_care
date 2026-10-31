import React from 'react';

interface PulseReading { source?: string; timestamp?: string; heart_rate: number }
export function getPulseState(reading: PulseReading, now = Date.now()) {
 const age = now - Date.parse(reading.timestamp || '');
 const active = reading.source === 'device' && Number.isFinite(reading.heart_rate) && reading.heart_rate > 0 && reading.heart_rate <= 300 && age >= -5000 && age <= 15000;
 return {active, duration: active ? 60 / reading.heart_rate : 1};
}

export default function HeartRatePulse({reading, now}: {reading:PulseReading; now?:number}) {
 const {active,duration}=getPulseState(reading,now);
 return <div aria-label={active?'Live pulse animation based on measured heart rate':'Pulse inactive - waiting for sensor readings'} data-pulse-active={active} className="mt-0">
  <div aria-hidden="true" className="flex h-6 items-center justify-center gap-1 overflow-hidden">
   {[4,6,10,16,24,18,11,7,4,6,10,16,24,18,11,7,4].map((height,i)=><span key={i} className={active?'gcare-pulse-bar w-1 rounded-full bg-teal':'w-1 rounded-full bg-slate-500/40'} style={{height:active?height:2,...(active?{animationDuration:duration+'s',animationDelay:-(i/17)*duration+'s'}:{})}}/>)}
  </div>
  <p className="text-[9px] leading-3 text-slate-400">{active?'Pulse animation':'Waiting for sensor'}</p>
 </div>;
}
