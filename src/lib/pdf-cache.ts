/**
 * Cache LRU bem simples, em memória — some quando a aba fecha ou o livro troca.
 *
 * Usa a ordem de inserção do Map (reinserir uma chave joga ela pro fim) pra saber
 * qual é a mais antiga na hora de expulsar. `aoDescartar` existe pra liberar recurso
 * externo (ex.: um object URL) quando uma entrada sai do cache, seja por estouro de
 * tamanho ou por `limpar()`.
 */
export class CachePaginas<T> {
  private mapa = new Map<string, T>();

  constructor(
    private readonly tamanho: number,
    private readonly aoDescartar?: (valor: T) => void,
  ) {}

  obter(chave: string): T | undefined {
    const valor = this.mapa.get(chave);
    if (valor !== undefined) {
      this.mapa.delete(chave);
      this.mapa.set(chave, valor);
    }
    return valor;
  }

  definir(chave: string, valor: T) {
    const antiga = this.mapa.get(chave);
    if (antiga !== undefined && antiga !== valor) this.aoDescartar?.(antiga);
    this.mapa.delete(chave);
    this.mapa.set(chave, valor);

    while (this.mapa.size > this.tamanho) {
      const chaveAntiga = this.mapa.keys().next().value;
      if (chaveAntiga === undefined) break;
      const valorAntigo = this.mapa.get(chaveAntiga)!;
      this.mapa.delete(chaveAntiga);
      this.aoDescartar?.(valorAntigo);
    }
  }

  limpar() {
    for (const valor of this.mapa.values()) this.aoDescartar?.(valor);
    this.mapa.clear();
  }
}
