import type {Allocation} from './model.js';

export type Weighted = {id:string;weight:number};
export type Transfer = {from:string;to:string;amount:number};
const validCents = (n:number) => Number.isSafeInteger(n) && Math.abs(n) <= 100_000_000;

export function splitWeighted(total:number,people:Weighted[]):Record<string,number>{
  if(!validCents(total) || !people.length || new Set(people.map(p=>p.id)).size!==people.length || people.some(p=>!p.id || !Number.isFinite(p.weight) || p.weight<0 || p.weight>100)) throw new Error('Invalid weighted split');
  const weight=people.reduce((n,p)=>n+p.weight,0);
  if(weight<=0) throw new Error('Split needs a positive weight');
  const absolute=Math.abs(total);
  const rows=people.map((p,index)=>{const raw=absolute*p.weight/weight;return {id:p.id,index,amount:Math.floor(raw),fraction:raw-Math.floor(raw)};});
  let remainder=absolute-rows.reduce((n,r)=>n+r.amount,0);
  for(const row of [...rows].sort((a,b)=>b.fraction-a.fraction || a.index-b.index)) if(remainder-->0) row.amount++;
  return Object.fromEntries(rows.map(r=>[r.id,Math.sign(total)*r.amount]));
}

export function allocateExpense(expense:{total:number;payers:{familyId:string;amount:number}[];splits:{amount:number;weights:Weighted[];fixed?:{familyId:string;amount:number}[]}[]},people:{id:string;familyId:string}[]):Allocation[]{
  if(!validCents(expense.total) || !expense.payers.length || expense.payers.some(p=>!validCents(p.amount) || !p.familyId) || expense.payers.reduce((n,p)=>n+p.amount,0)!==expense.total) throw new Error('Payers do not match total');
  if(expense.splits.reduce((n,s)=>n+s.amount,0)!==expense.total) throw new Error('Splits do not match total');
  const byId=new Map(people.map(p=>[p.id,p]));
  const allocations:Allocation[]=[];
  for(const split of expense.splits){
    if(!validCents(split.amount)) throw new Error('Invalid split amount');
    const fixed=split.fixed??[];
    if(fixed.some(f=>!validCents(f.amount) || Math.sign(f.amount)!==Math.sign(split.amount))) throw new Error('Invalid fixed amount');
    const remainder=split.amount-fixed.reduce((n,f)=>n+f.amount,0);
    if(Math.sign(remainder)!==Math.sign(split.amount) && remainder!==0) throw new Error('Fixed coverage exceeds split');
    if(remainder){
      for(const [id,amount] of Object.entries(splitWeighted(remainder,split.weights))){const person=byId.get(id);if(!person) throw new Error('Unknown participant');allocations.push({personId:id,familyId:person.familyId,amount});}
    }
    for(const f of fixed) if(f.amount) allocations.push({personId:null,familyId:f.familyId,amount:f.amount});
  }
  return allocations;
}

export function balances(families:string[],expenses:{total:number;payers:{familyId:string;amount:number}[];allocations:Allocation[]}[],payments:{from:string;to:string;amount:number}[]):Record<string,number>{
  const out:Record<string,number>=Object.fromEntries(families.map(f=>[f,0]));
  const add=(id:string,value:number)=>{if(!(id in out)) throw new Error('Unknown family');out[id]+=value;};
  for(const expense of expenses){
    if(expense.payers.reduce((n,p)=>n+p.amount,0)!==expense.total || expense.allocations.reduce((n,a)=>n+a.amount,0)!==expense.total) throw new Error('Expense does not balance');
    for(const payer of expense.payers) add(payer.familyId,payer.amount);
    for(const allocation of expense.allocations) add(allocation.familyId,-allocation.amount);
  }
  for(const payment of payments){if(!validCents(payment.amount) || payment.amount<=0 || payment.from===payment.to) throw new Error('Invalid payment');add(payment.from,payment.amount);add(payment.to,-payment.amount);}
  return out;
}

function greedy(input:Record<string,number>):Transfer[]{
  const debtors=Object.entries(input).filter(([,n])=>n<0).map(([id,n])=>({id,amount:-n})).sort((a,b)=>b.amount-a.amount||a.id.localeCompare(b.id));
  const creditors=Object.entries(input).filter(([,n])=>n>0).map(([id,n])=>({id,amount:n})).sort((a,b)=>b.amount-a.amount||a.id.localeCompare(b.id));
  const transfers:Transfer[]=[];let i=0,j=0;
  while(i<debtors.length&&j<creditors.length){const amount=Math.min(debtors[i].amount,creditors[j].amount);transfers.push({from:debtors[i].id,to:creditors[j].id,amount});debtors[i].amount-=amount;creditors[j].amount-=amount;if(!debtors[i].amount)i++;if(!creditors[j].amount)j++;}
  return transfers;
}

export function settle(input:Record<string,number>):{transfers:Transfer[];optimal:boolean}{
  const entries=Object.entries(input).filter(([,n])=>n!==0);
  if(entries.some(([,n])=>!validCents(n)) || entries.reduce((n,[,v])=>n+v,0)!==0) throw new Error('Balances do not conserve money');
  if(entries.length>15) return {transfers:greedy(input),optimal:false};
  let best=greedy(input);
  const names=entries.map(([id])=>id);
  const amounts=entries.map(([,v])=>v);
  const path:Transfer[]=[];
  // Exhaustive search is exponential; past this many steps return the best plan found so far, labeled non-minimal.
  let budget=200_000,exhausted=false;
  function visit(start:number){
    if(--budget<0){exhausted=true;return;}
    while(start<amounts.length && amounts[start]===0) start++;
    if(start===amounts.length){if(path.length<best.length)best=[...path];return;}
    if(path.length>=best.length) return;
    const seen=new Set<number>();
    for(let i=start+1;i<amounts.length;i++){
      if(amounts[start]*amounts[i]>=0 || seen.has(amounts[i])) continue;
      seen.add(amounts[i]);const before=amounts[i];const amount=Math.abs(amounts[start]);
      const from=amounts[start]<0?names[start]:names[i];const to=amounts[start]>0?names[start]:names[i];
      amounts[i]+=amounts[start];path.push({from,to,amount});visit(start+1);path.pop();amounts[i]=before;
      if(before+amounts[start]===0) break;
    }
  }
  visit(0);
  return {transfers:best,optimal:!exhausted};
}
