import {it,expect} from 'vitest';import {answerWatchQuestion} from '../lib/watchLocalAnswers.js';
it('answers Kannada and Hindi questions from current watch readings',()=>{
 expect(answerWatchQuestion('ನನ್ನ ಹಾರ್ಟ್ ರೇಟ್ ಎಷ್ಟು',{heart_rate:93})).toContain('93');
 expect(answerWatchQuestion('मेरा रक्तचाप कितना है',{systolic_bp:122,diastolic_bp:79})).toContain('122/79');
 expect(answerWatchQuestion('What is my oxygen?',{spo2:97.2})).toContain('97.2');
 expect(answerWatchQuestion('Hello',{})).toBeNull();
 expect(answerWatchQuestion('ನನ್ನ ಔಷಧ',{},[{brand_name:'Sample',times:['09:00']}])).toContain('09:00');
});