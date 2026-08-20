"use client";

/**
 * Armazenamento local (IndexedDB) pra leitura offline: o PDF baixado de cada
 * livro disponibilizado, e uma fila de alterações (progresso, marcações) feitas
 * sem internet, esperando pra sincronizar com o Supabase.
 */

const DB_NOME = "marginalia-offline";
const DB_VERSAO = 1;
const LOJA_PDFS = "pdfs";
const LOJA_FILA = "fila";

let dbPromise: Promise<IDBDatabase> | null = null;

function abrirDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, DB_VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(LOJA_PDFS)) {
        db.createObjectStore(LOJA_PDFS, { keyPath: "bookId" });
      }
      if (!db.objectStoreNames.contains(LOJA_FILA)) {
        db.createObjectStore(LOJA_FILA, { keyPath: "chave" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function pedido<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ================================================================== PDFs */

export type PdfOffline = {
  bookId: string;
  blob: Blob;
  storagePath: string;
  sizeBytes: number;
  savedAt: number;
};

export async function salvarPdfOffline(dado: PdfOffline): Promise<void> {
  const db = await abrirDb();
  await pedido(db.transaction(LOJA_PDFS, "readwrite").objectStore(LOJA_PDFS).put(dado));
  avisarOuvintes();
}

export async function obterPdfOffline(bookId: string): Promise<PdfOffline | undefined> {
  const db = await abrirDb();
  return pedido(
    db.transaction(LOJA_PDFS, "readonly").objectStore(LOJA_PDFS).get(bookId) as IDBRequest<
      PdfOffline | undefined
    >,
  );
}

export async function removerPdfOffline(bookId: string): Promise<void> {
  const db = await abrirDb();
  await pedido(db.transaction(LOJA_PDFS, "readwrite").objectStore(LOJA_PDFS).delete(bookId));
  avisarOuvintes();
}

/* ============================================== Fila de sincronização */

export type OpFila =
  | { tipo: "last_page"; bookId: string; page: number; lastReadAt: string }
  | { tipo: "highlight_add"; row: Record<string, unknown> }
  | { tipo: "highlight_del"; id: string }
  | { tipo: "bookmark_add"; row: Record<string, unknown> }
  | { tipo: "bookmark_del"; id: string };

export type ItemFila = { chave: string; op: OpFila; criadoEm: number };

/**
 * Enfileira (ou substitui, se a `chave` já existir) uma alteração pendente.
 * A chave é o que permite "coalescer": salvar a página de novo a cada virada
 * enquanto offline não empilha dezenas de updates, só substitui o mesmo item.
 */
export async function enfileirar(chave: string, op: OpFila): Promise<void> {
  const db = await abrirDb();
  const item: ItemFila = { chave, op, criadoEm: Date.now() };
  await pedido(db.transaction(LOJA_FILA, "readwrite").objectStore(LOJA_FILA).put(item));
  contagemFila += 1;
  avisarOuvintes();
}

export async function removerDaFila(chave: string): Promise<void> {
  const db = await abrirDb();
  await pedido(db.transaction(LOJA_FILA, "readwrite").objectStore(LOJA_FILA).delete(chave));
  contagemFila = Math.max(0, contagemFila - 1);
  avisarOuvintes();
}

export async function listarFila(): Promise<ItemFila[]> {
  const db = await abrirDb();
  const itens = await pedido(
    db.transaction(LOJA_FILA, "readonly").objectStore(LOJA_FILA).getAll() as IDBRequest<
      ItemFila[]
    >,
  );
  return itens.sort((a, b) => a.criadoEm - b.criadoEm);
}

/* ================================================== avisos pra UI reagir */
/*
 * `tamanhoFila()` é assíncrono (IndexedDB), mas useSyncExternalStore precisa de
 * um snapshot síncrono — por isso um contador em memória, carregado uma vez no
 * boot e mantido em dia a cada enfileirar/remover.
 */

let contagemFila = 0;
let contagemCarregada = false;

async function garantirContagemCarregada() {
  if (contagemCarregada) return;
  contagemCarregada = true;
  const db = await abrirDb();
  contagemFila = await pedido(
    db.transaction(LOJA_FILA, "readonly").objectStore(LOJA_FILA).count(),
  );
  avisarOuvintes();
}
if (typeof window !== "undefined") void garantirContagemCarregada();

export function contagemFilaAtual(): number {
  return contagemFila;
}

const ouvintes = new Set<() => void>();

export function ouvirMudancas(fn: () => void): () => void {
  ouvintes.add(fn);
  return () => {
    ouvintes.delete(fn);
  };
}

function avisarOuvintes() {
  ouvintes.forEach((fn) => fn());
}
