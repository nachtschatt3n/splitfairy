// Operator tool: creates a personal access token for an existing account, e.g. for an assistant such as OpenClaw.
// Needs shell access to the container (cluster admin). Prints only the token on stdout, so it can be piped
// straight into a secret without showing it; everything else goes to stderr. Revocable in the app.
// Usage inside the pod: node dist/server/scripts/create-token.js you@example.com "Juno (OpenClaw)"
import {DatabaseSync} from 'node:sqlite';
import {join,resolve} from 'node:path';
import {Store} from '../apps/server/src/store.js';
const email=(process.argv[2]??'').trim().toLowerCase(),name=(process.argv[3]??'').trim();
if(!email.includes('@')||!name){console.error('Usage: node dist/server/scripts/create-token.js <email> <token name>');process.exit(2);}
const store=new Store(new DatabaseSync(join(resolve(process.env.DATA_DIR??'data'),'splitfairy.sqlite')));
const user=store.userByEmail(email);
if(!user){console.error(`${email} has no account yet; sign in once first.`);process.exit(1);}
const created=store.createAccessToken(user,name.slice(0,80));
console.error(`Created access token "${created.name}" (${created.prefix}…) for ${email}. Revoke it under People & settings.`);
process.stdout.write(created.token);
