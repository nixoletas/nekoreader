"use client";

import type { Book, Bookmark, Highlight } from "@/lib/types";

/**
 * Armazenamento local (IndexedDB) pra leitura offline: o PDF baixado de cada
 * livro disponibilizado, um retrato (snapshot) dos dados de cada livro e da
 * estante pra abrir o app do zero sem internet, e uma fila de alterações
 * (progresso, marcações) feitas offline, esperando pra sincronizar.
 */

const DB_NOME = "marginalia-offline";
const DB_VERSAO = 2;
const LOJA_PDFS = "pdfs";
const LOJA_FILA = "fila";
const LOJA_LIVROS = "livros";
const LOJA_ESTANTE = "estante";

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
      if (!db.objectStoreNames.contains(LOJA_LIVROS)) {
        db.createObjectStore(LOJA_LIVROS, { keyPath: "bookId" });
      }
      if (!db.objectStoreNames.contains(LOJA_ESTANTE)) {
        db.createObjectStore(LOJA_ESTANTE, { keyPath: "chave" });
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

/* ============================================ Retrato de livro (offline) */

export type SnapshotLivro = {
  bookId: string;
  book: Book;
  highlights: Highlight[];
  bookmarks: Bookmark[];
  atualizadoEm: number;
};

/** Guardado a cada carregamento online bem-sucedido — é o que sustenta abrir o livro offline. */
export async function salvarSnapshotLivro(dado: SnapshotLivro): Promise<void> {
  const db = await abrirDb();
  await pedido(db.transaction(LOJA_LIVROS, "readwrite").objectStore(LOJA_LIVROS).put(dado));
}

export async function obterSnapshotLivro(bookId: string): Promise<SnapshotLivro | undefined> {
  const db = await abrirDb();
  return pedido(
    db.transaction(LOJA_LIVROS, "readonly").objectStore(LOJA_LIVROS).get(bookId) as IDBRequest<
      SnapshotLivro | undefined
    >,
  );
}

/* ============================================== Retrato da estante (offline) */

const CHAVE_ESTANTE = "lista";

type SnapshotEstante = { chave: typeof CHAVE_ESTANTE; books: Book[]; atualizadoEm: number };

export async function salvarSnapshotEstante(books: Book[]): Promise<void> {
  const db = await abrirDb();
  const dado: SnapshotEstante = { chave: CHAVE_ESTANTE, books, atualizadoEm: Date.now() };
  await pedido(db.transaction(LOJA_ESTANTE, "readwrite").objectStore(LOJA_ESTANTE).put(dado));
}

export async function obterSnapshotEstante(): Promise<Book[] | undefined> {
  const db = await abrirDb();
  const dado = await pedido(
    db.transaction(LOJA_ESTANTE, "readonly").objectStore(LOJA_ESTANTE).get(CHAVE_ESTANTE) as IDBRequest<
      SnapshotEstante | undefined
    >,
  );
  return dado?.books;
}

/* ============================================== Fila de sincronização */

export type OpFila =
  | {
      tipo: "last_page";
      bookId: string;
      page: number;
      lastReadAt: string;
      /** Opcional: item enfileirado por uma versão antiga do app não tem esse campo. */
      positions?: Record<string, number>;
    }
  | { tipo: "highlight_add"; row: Record<string, unknown> }
  | { tipo: "highlight_title"; id: string; title: string | null }
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

/**
 * Apaga tudo (PDFs baixados, retratos, fila) — chamado no logout. O IndexedDB é
 * por origem, não por conta: sem isso, num aparelho compartilhado, a segunda
 * pessoa que entra veria a estante e os livros baixados da primeira offline.
 */
export async function limparTudoOffline(): Promise<void> {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
  }
  dbPromise = null;
  contagemFila = 0;
  contagemCarregada = false;

  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NOME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve(); // segue mesmo se não conseguir — não é motivo pra travar o logout
    req.onblocked = () => resolve();
  });

  avisarOuvintes();
}
