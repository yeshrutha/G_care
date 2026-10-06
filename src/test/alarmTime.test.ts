import {it,expect} from 'vitest';import {from12HourParts,to12HourParts} from '../lib/timeFormat';
it('round trips midnight, noon and afternoon alarm times',()=>{for(const time of ['00:00','12:00','13:40','23:59'])expect(from12HourParts(to12HourParts(time))).toBe(time);});
