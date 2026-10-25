import { JOB_CATALOG } from './jobCatalog.js';
export const SKILL_PANEL_RULES_VERSION = 2;
export const SKILL_PANEL_RESET_GOLD = 1000;
export const SKILL_PANEL_MAX_SP = 80;
export const PANEL_EFFECT_LIMITS = Object.freeze({ maxHp:40,maxMp:20,attack:8,defense:6,elementPowerPercent:20,skillPowerPercent:20,healPowerPercent:25,guardPoints:20,mpReduction:1,flamePowerPercent:15,aquaPowerPercent:15,thunderPowerPercent:15 });
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
const jobPanels={
 adventurer:[['旅の剣',{attack:1}],['旅の魔力',{maxMp:2}],['旅の体力',{maxHp:5}],['旅の癒やし',{healPowerPercent:5}],['万能の心得',{attack:1,guardPoints:5}]],
 warrior:[['戦士の力',{attack:1}],['豪炎の心得',{flamePowerPercent:10}],['戦士の体力',{maxHp:5}],['剛腕',{attack:2}],['炎武の極意',{attack:2,flamePowerPercent:5}]],
 knight:[['騎士の体力',{maxHp:5}],['堅い守り',{defense:1}],['騎士の構え',{guardPoints:5}],['不屈の体',{maxHp:5}],['守護の極意',{defense:1,guardPoints:5}]],
 mage:[['魔法使いのMP',{maxMp:3}],['属性の心得',{elementPowerPercent:5}],['魔力研さん',{skillPowerPercent:5}],['魔力の泉',{maxMp:3}],['属性の極意',{elementPowerPercent:5,aquaPowerPercent:5}]],
 priest:[['僧侶の癒やし',{healPowerPercent:5}],['祈りのMP',{maxMp:3}],['祈りの守り',{guardPoints:5}],['節約の祈り',{mpReduction:1}],['癒やしの極意',{healPowerPercent:5,maxHp:5}]],
 thief:[['盗賊の力',{attack:1}],['雷技の心得',{thunderPowerPercent:10}],['技巧のMP',{maxMp:2}],['鋭い技',{attack:1}],['雷技の極意',{thunderPowerPercent:5,attack:1}]],
};
const jobPositions=[[400,280],[250,190],[550,190],[250,80],[550,80]];
for(const [jobId,panels] of Object.entries(jobPanels))panels.forEach(([name,effects],index)=>{
 const id='job_'+jobId+'_'+(index+1),prefix='job_'+jobId+'_',secret=index===4,neighbors=secret?[prefix+'3',prefix+'4']:[index===0?'start':prefix+([0,1,1,2][index])];
 nodes.push({id,name,jobId,branch:JOB_CATALOG[jobId].name,cost:[2,3,4,4,6][index],minLevel:[1,3,5,7,12][index],x:jobPositions[index][0],y:jobPositions[index][1],neighbors,secret,requiresAll:secret?neighbors:[],effects});
});
export const SKILL_PANEL_CATALOG = Object.freeze(Object.fromEntries(nodes.map(node=>[node.id,node])));
export const panelEffectDescription = effects => Object.entries(effects).map(([key,value])=>({maxHp:'最大HP＋',maxMp:'最大MP＋',attack:'攻撃力＋',defense:'防御力＋',elementPowerPercent:'属性攻撃威力＋',skillPowerPercent:'MP攻撃技威力＋',healPowerPercent:'回復効果＋',guardPoints:'ガード軽減率＋',mpReduction:'消費MP－',flamePowerPercent:'炎斬り威力＋',aquaPowerPercent:'水刃威力＋',thunderPowerPercent:'雷撃威力＋'}[key]||key)+value+(['elementPowerPercent','skillPowerPercent','healPowerPercent','flamePowerPercent','aquaPowerPercent','thunderPowerPercent'].includes(key)?'%':key==='guardPoints'?'ポイント':'')).join('・');
