import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
 root:fileURLToPath(new URL('./web',import.meta.url)),
 publicDir:fileURLToPath(new URL('./public',import.meta.url)),
 server:{port:5173,strictPort:true},
 build:{target:'es2022',outDir:fileURLToPath(new URL('./dist',import.meta.url)),emptyOutDir:true}
});
