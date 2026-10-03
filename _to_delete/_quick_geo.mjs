import { sanitizeBoardVisual, lineClaim, stripUnverifiedClaims } from '../../src/visual/sanitize.ts';
console.log(lineClaim('2x - 5y = 32'), lineClaim('x + 2y = 8'), lineClaim('3x-4y=12 (Line 2)'), lineClaim('y = 2x + 1'), lineClaim('x = 4'), lineClaim('y = 5'), lineClaim('5y = 32'));
const mk = (texts) => ({ dim:'2d', title:'Parallel lines', purpose:'teach', representation:'visual_diagram', why:'',
  frame:{kind:'plane',x:[-6,6],y:[-4,8],axes:'both',grid:true,equalScale:false},
  elements:[
   {id:'l1',kind:'line',through:[[0,0],[4,4]],color:'emerald'},
   {id:'l2',kind:'line',through:[[0,2],[4,6]],color:'rose'},
   {id:'t1',kind:'text',at:texts[0][0],text:texts[0][1],math:true},
   {id:'t2',kind:'text',at:texts[1][0],text:texts[1][1],math:true},
  ],
  steps:[{id:'s1',name:'lines',caption:'Look at both lines',show:['l1','l2','t1','t2']}]});
for (const [name,t] of Object.entries({
  good: [[[4.6,4.2],'y = x'],[[4.6,6.2],'y = x + 2']],
  swapped: [[[4.6,4.2],'y = x + 2'],[[4.6,6.2],'y = x']],
  floating: [[[-5,7],'y = x'],[[4.6,6.2],'y = x + 2']],
  nonexistent: [[[4.6,4.2],'y = x'],[[4.6,6.2],'y = x + 5']],
})) {
  const r = sanitizeBoardVisual(mk(t));
  console.log(name, r.issues.filter(i=>i.severity!=='fix').map(i=>i.severity+': '+i.message));
  if (name==='swapped') { const s = stripUnverifiedClaims(r.visual, r.issues); console.log('  after strip:', s.visual.elements.map(e=>e.id), s.visual.steps[0].show); }
}
