// Stands in for the private Ollama host so the real receipt worker runs end to end in CI.
import {createServer} from 'node:http';
// The receipt is dated four days from now, matching the dinner the flow test plans for that day.
const receiptDate=()=>{const d=new Date(Date.now()+4*86400_000);return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${d.getFullYear()}`;};
const receipt={merchant:'Mercado da Ribeira',total:23.1,items:[{label:'Pão',amount:2.4},{label:'Sardinhas',amount:9.9},{label:'Vinho verde',amount:6.5},{label:'Protetor solar',amount:4.8},{label:'Tara garrafa',amount:-0.5}]};
createServer((req,res)=>{
 if(req.url==='/api/tags'){res.end(JSON.stringify({models:[{name:'fake-vision'}]}));return;}
 let body='';req.on('data',c=>body+=c);req.on('end',()=>{
  const ok=req.url==='/api/chat'&&JSON.parse(body||'{}').messages?.[0]?.images?.length===1;
  res.writeHead(ok?200:400,{'content-type':'application/json'});
  res.end(JSON.stringify(ok?{message:{role:'assistant',content:JSON.stringify({...receipt,date:receiptDate()})}}:{error:'expected one image'}));
 });
}).listen(Number(process.argv[2]),'127.0.0.1');
