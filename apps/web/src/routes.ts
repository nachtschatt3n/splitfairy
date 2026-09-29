/** Clean URLs: /trips, /trips/<id>, /trips/<id>/plan[/<yyyy-mm-dd>], /pack, /shop, /spend, /settle, /people. */
export type Tab='today'|'plan'|'packing'|'shopping'|'expenses'|'balances'|'people';
export type Route={tripId:string|null;tab:Tab;day:string|null};
const SLUGS:Record<Tab,string>={today:'',plan:'plan',packing:'pack',shopping:'shop',expenses:'spend',balances:'settle',people:'people'};
const TABS=Object.fromEntries(Object.entries(SLUGS).map(([tab,slug])=>[slug,tab as Tab])) as Record<string,Tab>;

/** Reads a path; `null` for "/" (no preference: the app opens the last trip or the list). */
export function parseRoute(path:string):Route|null{
 const parts=path.split('/').filter(Boolean).map(decodeURIComponent);
 if(!parts.length)return null;
 if(parts[0]!=='trips')return null;
 if(parts.length===1)return {tripId:null,tab:'today',day:null};
 const tab=TABS[parts[2]??'']??'today';
 const day=tab==='plan'&&/^\d{4}-\d{2}-\d{2}$/.test(parts[3]??'')?parts[3]:null;
 return {tripId:parts[1],tab,day};
}

export function routePath(route:Route){
 if(!route.tripId)return '/trips';
 const slug=SLUGS[route.tab];
 return `/trips/${encodeURIComponent(route.tripId)}${slug?`/${slug}`:''}${route.tab==='plan'&&route.day?`/${route.day}`:''}`;
}
