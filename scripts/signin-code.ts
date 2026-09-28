// Operator escape hatch when sign-in email does not arrive: prints a one-time code for an invited address.
// Needs shell access to the container (cluster admin), so it adds nothing to the public attack surface.
// Usage inside the pod: node dist/server/scripts/signin-code.js you@example.com
import {DatabaseSync} from 'node:sqlite';
import {randomInt} from 'node:crypto';
import {join,resolve} from 'node:path';
import {Store} from '../apps/server/src/store.js';
import {codeHash} from '../apps/server/src/app.js';
const email=(process.argv[2]??'').trim().toLowerCase(),secret=process.env.AUTH_SECRET??'';
if(!email.includes('@')||secret.length<32){console.error('Usage: node dist/server/scripts/signin-code.js <email> (AUTH_SECRET must be set)');process.exit(2);}
const store=new Store(new DatabaseSync(join(resolve(process.env.DATA_DIR??'data'),'splitfairy.sqlite')));
if(!store.canLogin(email,process.env.ADMIN_EMAIL??'')){console.error(`${email} is neither the admin nor invited, so it cannot sign in.`);process.exit(1);}
const code=String(randomInt(0,1_000_000)).padStart(6,'0');
store.issueCode(email,codeHash(secret,email,code),Date.now()+15*60_000);
console.log(`Sign-in code for ${email}: ${code} (valid 15 minutes, replaces earlier codes). On the sign-in page choose "I already have a code".`);
