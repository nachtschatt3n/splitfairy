// Email templates: table layout and inline styles so Gmail, GMX, Outlook and Apple Mail render them alike.
// The logo is attached inline (Content-ID) by the transport, so it shows without loading remote images.
export const LOGO_CID='logo@splitfairy';
export type MailMessage={subject:string;text:string;html:string};
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const FONT="-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function layout({preheader,title,body}:{preheader:string;title:string;body:string}){
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#f7f5ef;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f7f5ef;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5ef;"><tr><td align="center" style="padding:32px 16px;">
 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fffefa;border-radius:20px;overflow:hidden;border:1px solid #e7e8df;">
  <tr><td style="background:#153f40;padding:24px 28px;">
   <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="vertical-align:middle;"><img src="cid:${LOGO_CID}" width="44" height="44" alt="" style="display:block;border:0;border-radius:12px;"></td>
    <td style="vertical-align:middle;padding-left:12px;font-family:${FONT};font-size:24px;font-weight:700;letter-spacing:-0.5px;color:#f7f5ef;">split<span style="font-weight:400;">fairy</span></td>
   </tr></table>
  </td></tr>
  <tr><td style="padding:30px 28px 8px;font-family:${FONT};color:#243533;">${body}</td></tr>
  <tr><td style="padding:18px 28px 26px;font-family:${FONT};font-size:12px;line-height:1.5;color:#56675f;border-top:1px solid #f0eee6;">Splitfairy &middot; So we split fairly.<br>You get this email because someone planning a trip added this address.</td></tr>
 </table>
</td></tr></table></body></html>`;
}
const h1=(s:string)=>`<h1 style="margin:0 0 12px;font-size:24px;line-height:1.25;font-weight:700;color:#153f40;">${s}</h1>`;
const p=(s:string)=>`<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3c4f4a;">${s}</p>`;

export function signInEmail(code:string):MailMessage{
 const spaced=`${code.slice(0,3)} ${code.slice(3)}`;
 return {
  subject:`${code} is your Splitfairy sign-in code`,
  text:`Your Splitfairy sign-in code:\n\n${code}\n\nIt works for 30 minutes. If you ask for another code, only the newest one works.\n\nOn the sign-in page choose "I already have a code" if you closed it.`,
  html:layout({preheader:`Your code: ${code}. It works for 30 minutes.`,title:'Your sign-in code',body:
   h1('Your sign-in code')+
   p('Enter this code on the Splitfairy sign-in page. It works for 30 minutes.')+
   `<div style="margin:6px 0 20px;padding:18px;border-radius:14px;background:#e9f2ed;text-align:center;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:6px;color:#153f40;">${spaced}</div>`+
   p('If you asked for more than one code, only the newest one works. Closed the page? Open Splitfairy again and choose <strong>I already have a code</strong>.')+
   p('<span style="color:#56675f;">Did not ask for a code? You can ignore this email.</span>')}),
 };
}

export function inviteEmail({inviter,tripName,url,name}:{inviter:string;tripName:string;url:string;name?:string}):MailMessage{
 const greet=name?`Hi ${name},\n\n`:'';
 return {
  subject:`Join ${tripName} on Splitfairy`,
  text:`${greet}${inviter} invited you to "${tripName}" on Splitfairy, where the group plans meals and shares costs fairly.\n\nOpen ${url} and sign in with this email address. You will get a six-digit code by email.`,
  html:layout({preheader:`${inviter} invited you to ${tripName}.`,title:`Join ${tripName}`,body:
   h1(name?`Hi ${esc(name)}, you're invited`:"You're invited")+
   p(`<strong>${esc(inviter)}</strong> invited you to <strong>${esc(tripName)}</strong> on Splitfairy, where the group plans meals, keeps a shared shopping and packing list, and splits costs fairly between families.`)+
   `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px;"><tr><td style="border-radius:12px;background:#164a44;"><a href="${esc(url)}" style="display:inline-block;padding:14px 26px;font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">Open Splitfairy</a></td></tr></table>`+
   p('Sign in with this email address. You will get a six-digit code by email, no password needed.')+
   p(`<span style="color:#56675f;">Button not working? Open <a href="${esc(url)}" style="color:#1f5f53;">${esc(url)}</a></span>`)}),
 };
}
