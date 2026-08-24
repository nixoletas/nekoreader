/**
 * Prepara os módulos puros de `src/lib` pra rodar no node.
 *
 * Os testes precisam da mesma lógica que o navegador usa — remontagem do PDF,
 * numeração do livro, sumário —, e ela é escrita em TypeScript com o atalho
 * `@/lib/...`. O `tsc` traduz o TypeScript mas **não** reescreve o atalho, e o
 * node não sabe resolver ele: por isso a segunda passada, que troca `@/lib/`
 * pelo caminho relativo do arquivo vizinho.
 *
 * A mesma passada renomeia pra `.mjs`: o `package.json` do app não declara
 * `type: module`, então um `.js` solto seria lido como CommonJS e o `import`
 * dentro dele estouraria.
 *
 * Sai em `node_modules/.cache/teste`, que já é ignorado pelo git.
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SAIDA = join("node_modules", ".cache", "teste", "lib");

execFileSync("npx", ["tsc", "-p", "tsconfig.test.json"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

let prontos = 0;
for (const nome of readdirSync(SAIDA)) {
  if (!nome.endsWith(".js")) continue;
  const caminho = join(SAIDA, nome);
  // `from "@/lib/x"` → `from "./x.mjs"`; o node exige a extensão no import.
  const conteudo = readFileSync(caminho, "utf8").replace(
    /(["'])@\/lib\/([^"']+)\1/g,
    "$1./$2.mjs$1",
  );
  writeFileSync(caminho, conteudo);
  renameSync(caminho, caminho.replace(/\.js$/, ".mjs"));
  prontos++;
}

console.log(`${prontos} módulos prontos em ${SAIDA}`);
