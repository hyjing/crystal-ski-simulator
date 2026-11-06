import {defineConfig} from 'vite';

export default defineConfig({
  base:process.env.CRYSTAL_BASE_PATH||'/',
  plugins:[{name:'production-security-policy',apply:'build',transformIndexHtml(){return[{tag:'meta',attrs:{'http-equiv':'Content-Security-Policy',content:"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' blob:; media-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'"},injectTo:'head-prepend'}];}}],
});
