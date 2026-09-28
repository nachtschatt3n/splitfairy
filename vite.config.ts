import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {VitePWA} from 'vite-plugin-pwa';
export default defineConfig({plugins:[react(),VitePWA({registerType:'autoUpdate',includeAssets:['icon.svg'],manifest:{name:'Splitfairy',short_name:'Splitfairy',description:'Plan together. Split fairly.',theme_color:'#153f40',background_color:'#f7f3e9',display:'standalone',start_url:'/',icons:[{src:'/icon.svg',sizes:'any',type:'image/svg+xml',purpose:'any maskable'}]},workbox:{navigateFallback:'/index.html',navigateFallbackDenylist:[/^\/api\//,/^\/healthz/,/^\/readyz/],globPatterns:['**/*.{js,css,html,svg,woff2}']}})],build:{outDir:'dist/web'},server:{port:5173,proxy:{'/api':'http://localhost:3000','/healthz':'http://localhost:3000'}}});
