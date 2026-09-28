/** European airlines by IATA code, drawn as a badge in the airline's colours (not their logos, which are trademarks). */
const AIRLINES:Record<string,{name:string;bg:string;fg:string}>={
 LH:{name:'Lufthansa',bg:'#05164d',fg:'#ffad00'},
 TP:{name:'TAP Air Portugal',bg:'#00a651',fg:'#ffffff'},
 LX:{name:'Swiss',bg:'#e30613',fg:'#ffffff'},
 OS:{name:'Austrian',bg:'#d81e05',fg:'#ffffff'},
 SN:{name:'Brussels Airlines',bg:'#003a70',fg:'#ffffff'},
 EW:{name:'Eurowings',bg:'#a1005f',fg:'#ffffff'},
 DE:{name:'Condor',bg:'#ffcc00',fg:'#1c1c1c'},
 X3:{name:'TUIfly',bg:'#092a5e',fg:'#70cbf4'},
 FR:{name:'Ryanair',bg:'#073590',fg:'#f1c933'},
 U2:{name:'easyJet',bg:'#ff6600',fg:'#ffffff'},
 W6:{name:'Wizz Air',bg:'#c6007e',fg:'#ffffff'},
 BA:{name:'British Airways',bg:'#075aaa',fg:'#ffffff'},
 AF:{name:'Air France',bg:'#002157',fg:'#ffffff'},
 KL:{name:'KLM',bg:'#00a1de',fg:'#ffffff'},
 HV:{name:'Transavia',bg:'#00d66c',fg:'#ffffff'},
 TO:{name:'Transavia France',bg:'#00d66c',fg:'#ffffff'},
 IB:{name:'Iberia',bg:'#d7192d',fg:'#ffcc00'},
 VY:{name:'Vueling',bg:'#ffcc00',fg:'#3c3c3b'},
 UX:{name:'Air Europa',bg:'#00338d',fg:'#ffffff'},
 AZ:{name:'ITA Airways',bg:'#004c97',fg:'#ffffff'},
 SK:{name:'SAS',bg:'#000b6d',fg:'#ffffff'},
 AY:{name:'Finnair',bg:'#0b1560',fg:'#ffffff'},
 EI:{name:'Aer Lingus',bg:'#006272',fg:'#ffffff'},
 DY:{name:'Norwegian',bg:'#d81939',fg:'#ffffff'},
 LO:{name:'LOT',bg:'#11397e',fg:'#ffffff'},
 A3:{name:'Aegean',bg:'#0b2f6b',fg:'#88c4ea'},
 TK:{name:'Turkish Airlines',bg:'#c70a0c',fg:'#ffffff'},
 BT:{name:'airBaltic',bg:'#b4d330',fg:'#1f1f1f'},
 V7:{name:'Volotea',bg:'#e5007e',fg:'#ffffff'},
 OU:{name:'Croatia Airlines',bg:'#1c3f94',fg:'#ffffff'},
 JU:{name:'Air Serbia',bg:'#1d3e7a',fg:'#ffffff'},
 RO:{name:'TAROM',bg:'#0b2b6a',fg:'#ffffff'},
 FB:{name:'Bulgaria Air',bg:'#00347f',fg:'#ffffff'},
 LG:{name:'Luxair',bg:'#00a0dc',fg:'#ffffff'},
 WK:{name:'Edelweiss',bg:'#a0001e',fg:'#ffffff'},
 NT:{name:'Binter',bg:'#00843d',fg:'#ffffff'},
 S4:{name:'Azores Airlines',bg:'#00338d',fg:'#ffffff'},
};

/** "LH1172" or "lh 1172" → {code:'LH',number:'LH 1172',airline} (airline only when known). */
export function parseFlight(flightNo:string|undefined){
 const m=/^([A-Z0-9]{2})\s?(\d{1,4}[A-Z]?)$/.exec((flightNo??'').trim().toUpperCase());
 if(!m)return null;
 return {code:m[1],number:`${m[1]} ${m[2]}`,airline:AIRLINES[m[1]]??null};
}

/** A small tail-fin style badge with the airline code. */
export function AirlineBadge({flightNo,size=34}:{flightNo:string|undefined;size?:number}){
 const flight=parseFlight(flightNo);if(!flight)return null;
 const colors=flight.airline??{bg:'var(--primary)',fg:'var(--on-primary)'};
 return <span className="airline-badge" style={{background:colors.bg,color:colors.fg,width:size,height:size}} title={flight.airline?.name??flight.code} aria-hidden="true">{flight.code}</span>;
}
