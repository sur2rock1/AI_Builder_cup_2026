import { leaksAnswer, lintLessonLeaks, lintApplyPicture, fingerprints } from '../../src/quality/leakLint.ts';
console.log(fingerprints('The line has m = 2/3 and c = -2, through (0, 40)'));
console.log(leaksAnswer('7y - (-6y) = 13y so y = 3', 'y = 3', 'Solve the system'));
console.log(leaksAnswer('Mitosis makes two identical diploid cells', 'Two genetically identical diploid daughter cells', 'What does mitosis make?'));
console.log(leaksAnswer('Use y = mx + c', 'y = 2x + 1', 'Find the line'));
const lesson = { chalkNotes: { bulletPoints: ['Substitute back: x = 4, y = -2'] }, quiz: { question: 'Solve 2x+y=6 and x-y=6', options: ['x = 4, y = -2','a','b','c'], correctIndex: 0, explanation: '' } };
console.log(lintLessonLeaks(lesson, ['Solve 2x + y = 6 and x - y = 6 → ... → x=4']).map(i=>i.code+':'+i.where));
const v = { dim:'2d', title:'t', steps:[{id:'s1',name:'a',caption:'Make the y coefficients match',show:['p'],phase:'apply'}], frame:{kind:'plane',x:[-6,6],y:[-6,6],axes:'both'}, elements:[{id:'p',kind:'point',at:[4,-2],label:'?'}] };
console.log(lintApplyPicture(v,{level:3,prompt:'Solve 2x+y=6 and x-y=6',lookFor:'x = 4, y = -2 (point (4, -2))'}).map(i=>i.code));
