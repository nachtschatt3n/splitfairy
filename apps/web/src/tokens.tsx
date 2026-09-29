import {useEffect,useState,type FormEvent} from 'react';
import {Copy,KeyRound,Trash2} from 'lucide-react';
import {api,type AccessToken} from './api.js';
import {Button,fmt} from './common.js';

/** Personal access tokens for AI assistants (MCP) and scripts (REST); a new token is shown once. */
export function AccessTokens(){
 const [tokens,setTokens]=useState<AccessToken[]|null>(null),[name,setName]=useState(''),[fresh,setFresh]=useState<string|null>(null),[error,setError]=useState(''),[copied,setCopied]=useState('');
 const load=()=>api.tokens().then(setTokens).catch(()=>setError('Access tokens need a connection.'));
 useEffect(()=>{void load();},[]);
 const mcpUrl=`${location.origin}/mcp`;
 const copy=async(value:string,what:string)=>{try{await navigator.clipboard.writeText(value);setCopied(what);setTimeout(()=>setCopied(''),2500);}catch{setCopied('');}};
 const create=async(e:FormEvent)=>{e.preventDefault();setError('');try{const t=await api.createToken(name.trim()||'Assistant');setFresh(t.token);setName('');await load();}catch(err){setError(err instanceof Error?err.message:'Could not create the token');}};
 const revoke=async(t:AccessToken)=>{if(!window.confirm(`Revoke "${t.name}"? Anything using it stops working.`))return;await api.revokeToken(t.id);if(fresh?.startsWith(t.prefix))setFresh(null);await load();};
 return <div className="settings-block tokens-block"><span className="eyebrow">AI assistants & access tokens</span>
  <p>Let Claude, Codex or OpenClaw work with your trips. A token acts as you, with your trips and roles. Connect assistants to <code>{mcpUrl}</code> (MCP) or use the API at <code>{location.origin}/api/v1</code>.</p>
  {fresh&&<div className="token-fresh" role="status"><strong>Copy your new token now; it will not be shown again.</strong>
   <div className="token-value"><code>{fresh}</code><Button kind="secondary" onClick={()=>void copy(fresh,'token')}><Copy size={15}/> {copied==='token'?'Copied':'Copy'}</Button></div>
   <p className="helper">Claude Code:</p>
   <pre className="snippet">{`export SPLITFAIRY_PAT=…  # the token above
claude mcp add --transport http splitfairy ${mcpUrl} \\
  --header "Authorization: Bearer $SPLITFAIRY_PAT"`}</pre>
   <p className="helper">Codex, in <code>~/.codex/config.toml</code>:</p>
   <pre className="snippet">{`[mcp_servers.splitfairy]
url = "${mcpUrl}"
bearer_token_env_var = "SPLITFAIRY_PAT"`}</pre>
   <p className="helper">OpenClaw and the Splitfairy skill: see “AI assistants” in the project README.</p>
  </div>}
  <form className="token-form" onSubmit={create}><label>Name<input value={name} onChange={e=>setName(e.target.value)} placeholder="Claude on my laptop" maxLength={80}/></label><Button type="submit"><KeyRound size={16}/> Create token</Button></form>
  {error&&<p className="form-error" role="alert">{error}</p>}
  {tokens&&tokens.length>0&&<ul className="token-list" aria-label="Your access tokens">{tokens.map(t=><li key={t.id}><span><strong>{t.name}</strong><small><code>{t.prefix}…</code> · created {fmt(t.createdAt.slice(0,10))} · {t.lastUsedAt?`last used ${fmt(t.lastUsedAt.slice(0,10))}`:'never used'}</small></span><button type="button" className="icon-button subtle" aria-label={`Revoke ${t.name}`} onClick={()=>void revoke(t)}><Trash2 size={16}/></button></li>)}</ul>}
 </div>;
}
