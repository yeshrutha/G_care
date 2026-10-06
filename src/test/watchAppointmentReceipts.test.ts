import {it,expect} from 'vitest';
import {hasAppointmentReceipt,recordAppointmentReceipt} from '../lib/watchAppointmentReceipts.js';
it('remembers appointments after refresh and isolates patients and new bookings',()=>{
 const values=new Map();const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 recordAppointmentReceipt(storage,'usha','appt1');
 expect(hasAppointmentReceipt({...storage},'usha','appt1')).toBe(true);
 expect(hasAppointmentReceipt(storage,'usha','appt2')).toBe(false);
 expect(hasAppointmentReceipt(storage,'shekar','appt1')).toBe(false);
});