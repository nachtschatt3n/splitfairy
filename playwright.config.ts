import {defineConfig,devices} from '@playwright/test';
import {E2E_ENV,E2E_PORT,OLLAMA_PORT} from './tests/e2e/env.js';
// Two layers: fast UI tests against the Vite dev server with a mocked API (tests/browser),
// and real-server tests of whole flows and UX rules on phone and desktop (tests/e2e).
const real={testDir:'tests/e2e',use:{baseURL:`http://127.0.0.1:${E2E_PORT}`,locale:'en-GB',timezoneId:'Europe/Berlin',trace:'retain-on-failure' as const,screenshot:'only-on-failure' as const}};
export default defineConfig({
 retries:process.env.CI?1:0,
 reporter:process.env.CI?[['list'],['html',{open:'never'}]]:'list',
 projects:[
  {name:'mocked',testDir:'tests/browser',use:{baseURL:'http://127.0.0.1:5173',browserName:'chromium'}},
  {name:'iphone-webkit',...real,use:{...devices['iPhone 15'],...real.use}},
  {name:'iphone-chromium',...real,use:{...devices['iPhone 15'],...real.use,browserName:'chromium'}},
  {name:'desktop-chromium',...real,use:{...devices['Desktop Chrome'],...real.use,viewport:{width:1366,height:900}}},
 ],
 webServer:[
  {command:'npm run dev:ui',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI,timeout:60_000},
  {command:`node tests/e2e/fake-ollama.mjs ${OLLAMA_PORT}`,url:`http://127.0.0.1:${OLLAMA_PORT}/api/tags`,reuseExistingServer:false},
  // Fresh database every run: the real production build, sign-in mail captured to files.
  {command:'rm -rf .e2e && node dist/server/apps/server/src/index.js',url:`http://127.0.0.1:${E2E_PORT}/readyz`,env:E2E_ENV,reuseExistingServer:false,timeout:30_000},
 ],
});
