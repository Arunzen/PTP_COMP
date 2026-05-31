import fs from 'fs';
const html = fs.readFileSync(new URL('./index.html', import.meta.url),'utf8');
// pull the script body, keep only the engine + explanation (stop before the UI section)
const script = html.split('<script>')[1].split('</script>')[0];
const engine = script.split('/* ====')[0] + script.split('   UI')[0].split('========================================================================= */').slice(-1)[0];
// Simpler: cut everything from the "UI" banner comment onward
const cut = script.indexOf('   UI');
const code = script.slice(0, script.lastIndexOf('/* ===', cut));
eval(code + '\nglobalThis.__api={parseIntake,buildPlan,rerouteRain,rerouteClosed,rerouteBehind,explain,fmt,NOW,CITIES};');
const A = globalThis.__api;

function strip(h){return h.replace(/<[^>]+>/g,'');}
function printDay(seq){
  for(const it of seq){
    const t=A.fmt(it.start).padStart(8);
    const mark = it.start>=A.NOW ? ' ' : '·';
    console.log(`  ${mark} ${t}  ${it.role.padEnd(6)} ${it.stop.name}  [${it.stop.indoor?'indoor':'OUTDOOR'}]`);
  }
}
function assert(c,msg){ if(!c){console.error('  ✗ FAIL: '+msg); process.exitCode=1;} else console.log('  ✓ '+msg); }

let pass=0,fail=0;
const ok=(c,m)=>{ if(c){pass++;console.log('  ✓ '+m);} else {fail++;console.error('  ✗ FAIL: '+m);} };

console.log('\n=== Scenario 1: Lisbon demo prompt ===');
const prefs=A.parseIntake('One day in Lisbon — I love history and food, and I’d enjoy a scenic walk. Mid budget.');
console.log('prefs:',JSON.stringify(prefs));
const base=A.buildPlan(prefs);
printDay(base);
ok(base.length>=4 && base.length<=6,'plan has 4–6 stops');
ok(base.some(i=>i.role==='lunch') && base.some(i=>i.role==='dinner'),'has lunch + dinner anchors');
const din=base.find(i=>i.role==='dinner');
ok(din.start>=19*60+30,'dinner anchored at/after 7:30 PM ('+A.fmt(din.start)+')');
ok(base.every((it,i)=> i===0 || it.start>=base[i-1].end),'no overlaps — each stop starts after the previous ends');
ok(base.some(i=>i.start>=A.NOW && !i.stop.indoor && i.role==='sight'),'an outdoor sight exists after 2pm (so rain has bite)');

console.log('\n=== Scenario 2: RAIN at 2pm ===');
let seq=base.map(i=>({...i}));
const {seq:rs,diff:rd}=A.rerouteRain(seq,prefs);
printDay(rs);
console.log('  explanation:',strip(A.explain(rd,rs,prefs)));
ok(rd.added.length>0,'rain swapped in at least one indoor stop');
ok(rs.filter(i=>i.start>=A.NOW && i.role==='sight').every(i=>i.stop.indoor),'no outdoor sights remain after 2pm');
ok(rs.find(i=>i.role==='dinner').stop.id===din.stop.id,'dinner survived the rain');
ok(rs.every((it,i)=> i===0 || it.start>=rs[i-1].end),'re-timed plan still has no overlaps');

console.log('\n=== Scenario 3: RUNNING 90 MIN BEHIND ===');
let seq3=base.map(i=>({...i}));
const {seq:bs,diff:bd}=A.rerouteBehind(seq3,prefs);
printDay(bs);
console.log('  explanation:',strip(A.explain(bd,bs,prefs)));
const din3=bs.find(i=>i.role==='dinner');
ok(din3 && din3.start<=19*60+30,'dinner kept on time (≤7:30) — at '+A.fmt(din3.start));
ok(bs.every((it,i)=> i===0 || it.start>=bs[i-1].end),'no overlaps after delay');

console.log('\n=== Scenario 4: STOP CLOSED ===');
let seq4=base.map(i=>({...i}));
const victimId=seq4.find(i=>i.start>=A.NOW && i.role==='sight').stop.id;
const {seq:cs,diff:cd}=A.rerouteClosed(seq4,prefs,victimId);
printDay(cs);
console.log('  explanation:',strip(A.explain(cd,cs,prefs)));
ok(!cs.some(i=>i.stop.id===victimId),'closed stop is gone');
ok(cd.added.length===1,'a replacement was slotted in');
ok(cs.every((it,i)=> i===0 || it.start>=cs[i-1].end),'no overlaps after replacement');

console.log('\n=== Scenario 5: Kyoto + empty intake fallback ===');
const kp=A.parseIntake('relaxed day in kyoto for a foodie who loves gardens and old temples');
ok(kp.city==='kyoto','kyoto detected'); ok(kp.pace==='relaxed','relaxed pace detected');
const kbase=A.buildPlan(kp); ok(kbase.length>=4,'kyoto plan built');
const empty=A.buildPlan(A.parseIntake('')); ok(empty.length>=4,'empty intake still yields a full day (no dead screen)');

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail?1:0);
