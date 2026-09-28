// Shared by playwright.config.ts and the real-server tests: one throwaway server per run.
import {resolve} from 'node:path';
export const E2E_PORT=3100,OLLAMA_PORT=3101;
export const E2E_ROOT=resolve('.e2e');
export const E2E_ENV={
 NODE_ENV:'test',PORT:String(E2E_PORT),DATA_DIR:resolve(E2E_ROOT,'data'),MAIL_CAPTURE_DIR:resolve(E2E_ROOT,'mail'),
 ADMIN_EMAIL:'organizer@splitfairy.test',AUTH_SECRET:'e2e-secret-that-is-long-enough-for-hmac-000',
 OLLAMA_URL:`http://127.0.0.1:${OLLAMA_PORT}`,PLACES_URL:`http://127.0.0.1:${OLLAMA_PORT}/search`,OLLAMA_MODEL:'fake-vision',LOG_LEVEL:'warn',AUTH_RATE_LIMIT_FACTOR:'100',
};
export const ADMIN=E2E_ENV.ADMIN_EMAIL;
