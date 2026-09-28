import type {Expense,Person,Split,SplitMode,Trip} from '../../../packages/domain/src/model.js';
import {allocateExpense} from '../../../packages/domain/src/accounting.js';
import {cents,euro} from './common.js';

/** What the editor keeps while typing; each mode has its own inputs so switching back and forth loses nothing. */
export type SplitState={mode:SplitMode;people:string[];families:string[];exact:Record<string,string>;percent:Record<string,string>;shares:Record<string,string>;adjust:Record<string,string>};
export type CompiledSplit={mode:SplitMode;weights:{id:string;weight:number}[];fixed:{familyId:string;amount:number}[];personFixed:{personId:string;amount:number}[]};

const MODES:[SplitMode,string,string][]=[
 ['equal','=','Equally'],['exact','1.23','Exact amounts'],['percent','%','Percentages'],['shares','×','Shares'],['adjust','+/−','Adjustments'],['families','⌂','By family']];
const HELP:Record<SplitMode,string>={
 equal:'Choose who shares it; everyone chosen pays the same.',
 exact:'Say exactly how much each person owes.',
 percent:'Give each person a percentage; together they make 100%.',
 shares:'Good for nights or family sizes: 2 nights → 2 shares. It starts from everyone’s trip share (adult 1, child ½).',
 adjust:'Add what someone owes on top; the rest is shared equally.',
 families:'Choose the families; each pays the same.'};
const decimal=(value:string|undefined)=>value?.trim()?Number(value.replace(',','.')):0;
const plain=(n:number)=>String(Math.round(n*1000)/1000);
const money=(amount:number)=>(Math.abs(amount)/100).toFixed(2);

/** One short phrase for how an expense is split, for lists and details. */
export function describeSplit(trip:Trip,e:Expense){
 if(e.lines.length>1)return `${e.lines.length} items`;
 const s=e.lines[0]?.splits.length===1?e.lines[0].splits[0]:null;if(!s)return 'custom split';
 if(s.eventId)return `for ${trip.events.find(x=>x.id===s.eventId)?.title??'a removed plan'}`;
 const n=new Set([...s.weights.map(w=>w.id),...(s.personFixed??[]).map(f=>f.personId)]).size;const people=`${n} ${n===1?'person':'people'}`;
 switch(s.mode){
  case 'equal':return `split equally · ${people}`;
  case 'exact':return `exact amounts · ${people}`;
  case 'percent':return `by percentage · ${people}`;
  case 'shares':return `by shares · ${people}`;
  case 'adjust':return `equally with adjustments · ${people}`;
  case 'families':return `equally by family · ${s.fixed.length} families`;
  default:return s.fixed.length&&!s.weights.length?`by family amounts · ${s.fixed.length} families`:`by trip shares · ${people}`;
 }
}

/** Starts the editor from a saved split (in the mode it was entered in) or from the given people with their trip shares. */
export function initialSplit(trip:Trip,people:Person[],split?:Split|null,mode:SplitMode='equal'):SplitState{
 const state:SplitState={mode:split?.mode??mode,people:people.map(p=>p.id),families:trip.families.map(f=>f.id),exact:{},percent:{},shares:Object.fromEntries(people.map(p=>[p.id,plain(p.weight)])),adjust:{}};
 if(!split)return state;
 const weights=Object.fromEntries(split.weights.map(w=>[w.id,w.weight]));
 const fixed=Object.fromEntries((split.personFixed??[]).map(f=>[f.personId,f.amount]));
 if(split.weights.length)state.people=split.weights.map(w=>w.id);
 // Splits saved before modes existed were shared by trip weights.
 if(!split.mode)state.mode=split.fixed.length?'families':'shares';
 if(state.mode==='shares')state.shares={...state.shares,...Object.fromEntries(split.weights.map(w=>[w.id,plain(w.weight)]))};
 if(state.mode==='percent')state.percent=Object.fromEntries(split.weights.map(w=>[w.id,plain(weights[w.id])]));
 if(state.mode==='exact')state.exact=Object.fromEntries(Object.entries(fixed).map(([id,a])=>[id,money(a)]));
 if(state.mode==='adjust')state.adjust=Object.fromEntries(Object.entries(fixed).map(([id,a])=>[id,money(a)]));
 if(state.mode==='families'&&split.fixed.length)state.families=split.fixed.map(f=>f.familyId);
 return state;
}

/** Turns the editor into weights and fixed amounts for `total` (cents, negative for refunds), or explains what is missing. */
export function compileSplit(state:SplitState,people:Person[],total:number,trip:Trip):CompiledSplit|{error:string}{
 const sign=Math.sign(total)||1,absolute=Math.abs(total),ids=people.map(p=>p.id);
 const base={mode:state.mode,weights:[] as CompiledSplit['weights'],fixed:[] as CompiledSplit['fixed'],personFixed:[] as CompiledSplit['personFixed']};
 switch(state.mode){
  case 'equal':{const chosen=ids.filter(id=>state.people.includes(id));if(!chosen.length)return {error:'Choose at least one person.'};return {...base,weights:chosen.map(id=>({id,weight:1}))};}
  case 'shares':{
   const weights=ids.map(id=>({id,weight:decimal(state.shares[id])}));
   if(weights.some(w=>!Number.isFinite(w.weight)||w.weight<0||w.weight>100))return {error:'Shares are numbers from 0 to 100.'};
   const used=weights.filter(w=>w.weight>0).map(w=>({id:w.id,weight:Math.round(w.weight*1000)/1000}));if(!used.length)return {error:'Give at least one person a share.'};
   return {...base,weights:used};
  }
  case 'percent':{
   const weights=ids.map(id=>({id,weight:decimal(state.percent[id])}));
   if(weights.some(w=>!Number.isFinite(w.weight)||w.weight<0||w.weight>100))return {error:'Percentages are numbers from 0 to 100.'};
   const sum=weights.reduce((n,w)=>n+w.weight,0);if(Math.abs(sum-100)>.001)return {error:`The percentages add up to ${plain(sum)}%, not 100%.`};
   return {...base,weights:weights.filter(w=>w.weight>0).map(w=>({id:w.id,weight:Math.round(w.weight*1000)/1000}))};
  }
  case 'exact':{
   const rows=ids.map(id=>({personId:id,amount:state.exact[id]?.trim()?cents(state.exact[id]):0}));
   if(rows.some(r=>!Number.isSafeInteger(r.amount)||r.amount<0))return {error:'Enter amounts like 12.50.'};
   const sum=rows.reduce((n,r)=>n+r.amount,0);if(sum!==absolute)return {error:`The amounts add up to ${euro(sum)}, not ${euro(absolute)}.`};
   return {...base,personFixed:rows.filter(r=>r.amount).map(r=>({personId:r.personId,amount:r.amount*sign}))};
  }
  case 'adjust':{
   const rows=ids.map(id=>({personId:id,amount:state.adjust[id]?.trim()?cents(state.adjust[id]):0}));
   if(rows.some(r=>!Number.isSafeInteger(r.amount)||r.amount<0))return {error:'Enter adjustments like 4.00.'};
   if(rows.reduce((n,r)=>n+r.amount,0)>absolute)return {error:'The adjustments are more than the total.'};
   return {...base,weights:ids.map(id=>({id,weight:1})),personFixed:rows.filter(r=>r.amount).map(r=>({personId:r.personId,amount:r.amount*sign}))};
  }
  case 'families':{
   const chosen=trip.families.filter(f=>state.families.includes(f.id));if(!chosen.length)return {error:'Choose at least one family.'};
   const each=Math.trunc(absolute/chosen.length),extra=absolute%chosen.length;
   return {...base,fixed:chosen.map((f,i)=>({familyId:f.id,amount:(each+(i<extra?1:0))*sign}))};
  }
 }
}

/** What each person (or family) ends up owing, for the preview; empty while the input is incomplete. */
function preview(trip:Trip,compiled:CompiledSplit|{error:string},total:number){
 if('error' in compiled||!total)return {people:{} as Record<string,number>,families:{} as Record<string,number>};
 try{
  const rows=allocateExpense({total,payers:[{familyId:trip.families[0]?.id??'x',amount:total}],splits:[{amount:total,...compiled}]},trip.people);
  const people:Record<string,number>={},families:Record<string,number>={};
  for(const r of rows){if(r.personId)people[r.personId]=(people[r.personId]??0)+r.amount;families[r.familyId]=(families[r.familyId]??0)+r.amount;}
  return {people,families};
 }catch{return {people:{},families:{}};}
}

/** Splitwise-style split options: equally, exact amounts, percentages, shares, adjustments, or equally by family. */
export function SplitEditor({trip,people,total,value,onChange,legend='How is it split?'}:{trip:Trip;people:Person[];total:number;value:SplitState;onChange:(next:SplitState)=>void;legend?:string}){
 const valid=Number.isSafeInteger(total)&&total!==0;
 const compiled=compileSplit(value,people,valid?total:0,trip),shown=preview(trip,compiled,valid?total:0);
 const set=(patch:Partial<SplitState>)=>onChange({...value,...patch});
 const field=(key:'exact'|'percent'|'shares'|'adjust',id:string,v:string)=>set({[key]:{...value[key],[id]:v}});
 const absolute=Math.abs(valid?total:0),sumCents=(m:Record<string,string>)=>people.reduce((n,p)=>n+(m[p.id]?.trim()?cents(m[p.id])||0:0),0);
 let footer='';
 if(value.mode==='equal'){const n=people.filter(p=>value.people.includes(p.id)).length;footer=n&&valid?`${euro(Math.round(absolute/n))} per person (${n} ${n===1?'person':'people'})`:`${n} ${n===1?'person':'people'}`;}
 if(value.mode==='exact'){const sum=sumCents(value.exact);footer=`${euro(sum)} of ${euro(absolute)} · ${euro(absolute-sum)} left`;}
 if(value.mode==='percent'){const sum=people.reduce((n,p)=>n+(decimal(value.percent[p.id])||0),0);footer=`${plain(sum)}% of 100% · ${plain(100-sum)}% left`;}
 if(value.mode==='shares'){const sum=people.reduce((n,p)=>n+(decimal(value.shares[p.id])||0),0);footer=`${plain(sum)} total share${sum===1?'':'s'}`;}
 if(value.mode==='adjust'){const extra=sumCents(value.adjust);footer=`${euro(Math.max(0,absolute-extra))} shared equally, ${euro(extra)} in adjustments`;}
 if(value.mode==='families'){const n=trip.families.filter(f=>value.families.includes(f.id)).length;footer=n&&valid?`${euro(Math.round(absolute/n))} per family`:`${n} ${n===1?'family':'families'}`;}
 const owes=(id:string)=>shown.people[id]!==undefined?<small>{euro(shown.people[id])}</small>:null;
 // People are listed by family, the way costs are settled; each family shows its total.
 const groups=[...trip.families.map(f=>({id:f.id,name:f.name,members:people.filter(p=>p.familyId===f.id)})),{id:'',name:'Others',members:people.filter(p=>!trip.families.some(f=>f.id===p.familyId))}].filter(g=>g.members.length);
 const familyHead=(g:typeof groups[number])=><div className="split-family-head"><span>{g.name}</span>{value.mode==='equal'&&g.members.length>1&&<button type="button" className="text-button" onClick={()=>{const ids=g.members.map(p=>p.id),all=ids.every(id=>value.people.includes(id));set({people:all?value.people.filter(id=>!ids.includes(id)):[...new Set([...value.people,...ids])]});}}>{g.members.every(p=>value.people.includes(p.id))?'None':'All'}</button>}{shown.families[g.id]!==undefined&&<b>{euro(shown.families[g.id])}</b>}</div>;
 const touched=(key:'exact'|'percent'|'shares'|'adjust')=>people.some(p=>value[key][p.id]?.trim());
 return <fieldset className="split-editor"><legend>{legend}</legend>
  <div className="split-modes" role="group" aria-label="Split options">{MODES.map(([mode,symbol,label])=><button key={mode} type="button" className={value.mode===mode?'on':''} aria-pressed={value.mode===mode} aria-label={label} title={label} onClick={()=>set({mode})}><b aria-hidden="true">{symbol}</b><span>{label}</span></button>)}</div>
  <p className="helper split-help"><strong>{MODES.find(m=>m[0]===value.mode)![2]}.</strong> {HELP[value.mode]}</p>
  {value.mode==='families'?<div className="split-rows">{trip.families.map(f=><label key={f.id} className="split-row"><span className="split-name">{f.name}{shown.families[f.id]!==undefined&&<small>{euro(shown.families[f.id])}</small>}</span><input type="checkbox" checked={value.families.includes(f.id)} onChange={()=>set({families:value.families.includes(f.id)?value.families.filter(x=>x!==f.id):[...value.families,f.id]})}/></label>)}</div>
  :value.mode==='equal'?<><div className="chip-actions"><button type="button" className="text-button" onClick={()=>set({people:people.map(p=>p.id)})}>Everyone</button><button type="button" className="text-button" onClick={()=>set({people:[]})}>Nobody</button></div>
   <div className="split-rows">{groups.map(g=><div key={g.id} className="split-family">{familyHead(g)}{g.members.map(p=><label key={p.id} className="split-row"><span className="split-name">{p.name}{owes(p.id)}</span><input type="checkbox" checked={value.people.includes(p.id)} onChange={()=>set({people:value.people.includes(p.id)?value.people.filter(x=>x!==p.id):[...value.people,p.id]})}/></label>)}</div>)}</div></>
  :<div className="split-rows">{groups.map(g=><div key={g.id} className="split-family">{familyHead(g)}{g.members.map(p=>{const key=value.mode as 'exact'|'percent'|'shares'|'adjust';const unit=key==='percent'?'%':key==='shares'?'shares':'';const prefix=key==='adjust'?'+ €':key==='exact'?'€':'';
   return <label key={p.id} className="split-row"><span className="split-name">{p.name}{key!=='exact'&&owes(p.id)}</span><span className="split-input">{prefix&&<i aria-hidden="true">{prefix}</i>}<input inputMode="decimal" aria-label={`${p.name}: ${MODES.find(m=>m[0]===key)![2].toLowerCase()}`} value={value[key][p.id]??''} placeholder={key==='shares'?'0':key==='percent'?'0':'0.00'} onChange={e=>field(key,p.id,e.target.value)}/>{unit&&<i aria-hidden="true">{unit}</i>}</span></label>;})}</div>)}</div>}
  <p className="split-footer" aria-live="polite">{footer}</p>
  {'error' in compiled&&valid&&value.mode!=='equal'&&value.mode!=='families'&&touched(value.mode)&&<p className="helper split-warning" role="status">{compiled.error}</p>}
 </fieldset>;
}
