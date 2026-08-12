// Copia o worker do pdf.js para /public para o react-pdf carregar de mesma origem.
import { copyFileSync, cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pdfjsRoot = dirname(require.resolve("pdfjs-dist/package.json"));
const src = join(pdfjsRoot, "build", "pdf.worker.min.mjs");
const dest = join(process.cwd(), "public", "pdf.worker.min.mjs");

mkdirSync(join(process.cwd(), "public"), { recursive: true });
copyFileSync(src, dest);

// cMaps (CJK) e fontes padrão — evita PDFs com texto faltando.
for (const dir of ["cmaps", "standard_fonts"]) {
  cpSync(join(pdfjsRoot, dir), join(process.cwd(), "public", "pdfjs", dir), {
    recursive: true,
  });
}
console.log(`pdf.worker.min.mjs -> public/ (pdfjs-dist ${require("pdfjs-dist/package.json").version})`);
