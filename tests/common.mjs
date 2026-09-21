export const concept = { id:'finding-hypotenuse', label:'Finding the Hypotenuse', subjectId:'p', prerequisites:[],
  commonMisconceptions:['Adding a + b instead of a² + b²','Forgetting the square root'], keyFacts:['c = √(a²+b²)'],
  workedExamples:[], difficultyLevel:2, typicalTeachingOrder:3 };
export const input = { concept, conceptState:null, questionAsked:'How long is the ladder?', childAnswer:'7',
  childReasoning:'I added 3 and 4', currentStrategy:'direct_explanation', apiKey:'x' };
export const ok = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) process.exitCode = 1; };
