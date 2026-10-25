export const SKILL_PANEL_RULES_VERSION = 1;
export const SKILL_PANEL_RESET_GOLD = 1000;
export const SKILL_PANEL_MAX_SP = 80;
export const PANEL_EFFECT_LIMITS = Object.freeze({ maxHp:40,maxMp:20,attack:8,defense:6,elementPowerPercent:20,skillPowerPercent:20,healPowerPercent:25,guardPoints:20,mpReduction:1 });
const branches = [
 ['attack','攻撃',-1,-1,[['攻撃力＋1',{attack:1}],['属性威力＋5%',{elementPowerPercent:5}],['攻撃力＋1',{attack:1}],['MP技威力＋5%',{skillPowerPercent:5}],['攻撃力＋2',{attack:2}],['勇気の核',{attack:2,elementPowerPercent:5}]]],
 ['defense','耐久',1,-1,[['最大HP＋5',{maxHp:5}],['防御力＋1',{defense:1}],['最大HP＋5',{maxHp:5}],['防御力＋1',{defense:1}],['最大HP＋10',{maxHp:10}],['守りの核',{maxHp:10,defense:1}]]],
 ['magic','魔法',1,1,[['最大MP＋3',{maxMp:3}],['MP技威力＋5%',{skillPowerPercent:5}],['最大MP＋3',{maxMp:3}],['消費MP－1',{mpReduction:1}],['最大MP＋5',{maxMp:5}],['魔力の核',{maxMp:5,skillPowerPercent:5}]]],
 ['support','支援',-1,1,[['回復効果＋5%',{healPowerPercent:5}],['ガード＋5pt',{guardPoints:5}],['回復効果＋5%',{healPowerPercent:5}],['ガード＋5pt',{guardPoints:5}],['最大MP＋3',{maxMp:3}],['支援の核',{healPowerPercent:5,guardPoints:5}]]],
];
const positions=[[100,70],[200,140],[300,200],[160,260],[300,300],[160,200]];
const nodes=[{id:'start',name:'スタート',branch:'中央',cost:0,x:400,y:370,neighbors:[],effects:{},minLevel:1}];
for(const [branch,label,dx,dy,effects] of branches) effects.forEach(([name,effect],index)=>{
 const id=branch+'_'+(index+1),parent=index===0?'start':branch+'_'+([0,1,2,2,3,4][index]);
 const secret=index===5,requiresAll=secret?[branch+'_4',branch+'_5']:[];
 nodes.push({id,name,branch:label,cost:[2,3,4,4,5,7][index],x:400+dx*positions[index][0],y:370+dy*positions[index][1],neighbors:secret?requiresAll:[parent],requiresAll,secret,minLevel:[1,3,5,5,7,12][index],effects:effect});
});
export const SKILL_PANEL_CATALOG = Object.freeze(Object.fromEntries(nodes.map(node=>[node.id,node])));
export const panelEffectDescription = effects => Object.entries(effects).map(([key,value])=>({maxHp:'最大HP＋',maxMp:'最大MP＋',attack:'攻撃力＋',defense:'防御力＋',elementPowerPercent:'属性攻撃威力＋',skillPowerPercent:'MP攻撃技威力＋',healPowerPercent:'回復効果＋',guardPoints:'ガード軽減率＋',mpReduction:'消費MP－'}[key]||key)+value+(['elementPowerPercent','skillPowerPercent','healPowerPercent'].includes(key)?'%':key==='guardPoints'?'ポイント':'')).join('・');
