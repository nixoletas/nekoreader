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

// Tesseract (OCR de PDF digitalizado): worker e núcleo WASM servidos da mesma
// origem. Sem isto o tesseract.js busca tudo num CDN — o que quebraria em rede
// fechada e faria o app depender de terceiro pra abrir um livro. O dicionário do
// idioma continua vindo de fora, mas só na primeira vez (fica em IndexedDB) e é
// arquivo genérico: nada do livro sai daqui.
const ocr = join(process.cwd(), "public", "tesseract");
mkdirSync(ocr, { recursive: true });

copyFileSync(
  join(dirname(require.resolve("tesseract.js/package.json")), "dist", "worker.min.js"),
  join(ocr, "worker.min.js"),
);

const nucleo = dirname(require.resolve("tesseract.js-core/package.json"));
for (const arquivo of [
  "tesseract-core-simd-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm.js",
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-simd.wasm.js",
  "tesseract-core-relaxedsimd.wasm.js",
  "tesseract-core.wasm.js",
]) {
  try {
    copyFileSync(join(nucleo, arquivo), join(ocr, arquivo));
  } catch {
    // Nem toda versão do núcleo traz todas as variantes; o tesseract.js escolhe
    // entre as que existem (com SIMD quando o navegador tem).
  }
}
console.log("tesseract worker + núcleo -> public/tesseract/");
