import { beforeEach, describe, expect, it, vi } from 'vitest';
const session=vi.hoisted(()=>({signedIn:false}));
vi.mock('@/lib/api',()=>({getStoredToken:()=>session.signedIn?'test':null,getStoredUser:()=>null,apiFetch:vi.fn()}));
import {apiFetch} from '@/lib/api';
import {useGuardianStore} from '@/store/guardianStore';
const reminder={id:'med-test-0',elderId:'elder-1',type:'medication' as const,title:'Tablet',time:'08:00',repeat:'daily' as const,verified:false};
beforeEach(()=>{session.signedIn=false;vi.mocked(apiFetch).mockReset();useGuardianStore.setState({reminders:[reminder]});});
describe('durable reminder acknowledgement UI state',()=>{
 it('saves before marking Taken and preserves state when reminders rebuild',async()=>{session.signedIn=true;vi.mocked(apiFetch).mockResolvedValue({verified:true});expect(await useGuardianStore.getState().verifyReminder(reminder.id)).toBe(true);expect(apiFetch).toHaveBeenCalledWith('/reminder-acknowledgements',expect.objectContaining({method:'POST'}));useGuardianStore.getState().setReminders([{...reminder}]);expect(useGuardianStore.getState().reminders[0].verified).toBe(true);});
 it('does not falsely mark Taken when persistence fails',async()=>{session.signedIn=true;vi.mocked(apiFetch).mockRejectedValue(new Error('offline'));expect(await useGuardianStore.getState().verifyReminder(reminder.id)).toBe(false);expect(useGuardianStore.getState().reminders[0].verified).toBe(false);});
 it('old daily acknowledgements do not silence the next day',()=>{useGuardianStore.setState({reminders:[{...reminder,verified:true,acknowledgementDate:'2000-01-01'}]});useGuardianStore.getState().setReminders([{...reminder}]);expect(useGuardianStore.getState().reminders[0].verified).toBe(false);});
});
