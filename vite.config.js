import {defineConfig} from 'vite';

export default defineConfig({
  base:process.env.CRYSTAL_BASE_PATH||'/',
});
