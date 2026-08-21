"use client";

import { useRef, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { inspecionarPdf } from "@/lib/pdf";
import { Aviso } from "@/components/ui";

export default function Uploader({ onUploaded }: { onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function enviar(files: FileList | File[]) {
    const lista = Array.from(files).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (!lista.length) {
      setError("Só aceito arquivo PDF por enquanto.");
      return;
    }

    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Sessão expirada. Entre de novo.");
      return;
    }

    for (const [i, file] of lista.entries()) {
      const rotulo = lista.length > 1 ? `(${i + 1}/${lista.length}) ` : "";
      try {
        setStatus(`${rotulo}Lendo ${file.name}`);
        const { totalPages, cover } = await inspecionarPdf(file);

        const id = crypto.randomUUID();
        const pdfPath = `${user.id}/${id}.pdf`;

        setStatus(`${rotulo}Guardando na estante`);
        const up = await supabase.storage
          .from("books")
          .upload(pdfPath, file, { contentType: "application/pdf" });
        if (up.error) throw up.error;

        let coverPath: string | null = null;
        if (cover) {
          const cp = `${user.id}/${id}.jpg`;
          const upc = await supabase.storage
            .from("books")
            .upload(cp, cover, { contentType: "image/jpeg" });
          if (!upc.error) coverPath = cp;
        }

        const ins = await supabase.from("books").insert({
          id,
          user_id: user.id,
          title: file.name.replace(/\.pdf$/i, ""),
          storage_path: pdfPath,
          cover_path: coverPath,
          size_bytes: file.size,
          total_pages: totalPages,
          last_page: 1,
        });
        if (ins.error) {
          await supabase.storage.from("books").remove([pdfPath]);
          throw ins.error;
        }
      } catch (e) {
        setError(`Falhou em ${file.name}: ${(e as Error).message}`);
        setStatus(null);
        return;
      }
    }

    setStatus(null);
    if (inputRef.current) inputRef.current.value = "";
    onUploaded();
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void enviar(e.dataTransfer.files);
        }}
        onClick={() => !status && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        className={`group cursor-pointer rounded-3xl border-2 border-dashed px-5 py-7 text-center transition ${
          dragging
            ? "border-accent bg-accent/8"
            : "border-border bg-surface hover:border-accent/50"
        } ${status ? "pointer-events-none opacity-70" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          hidden
          onChange={(e) => e.target.files && void enviar(e.target.files)}
        />

        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent transition group-hover:scale-105">
          {status ? (
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-6 w-6" aria-hidden />
          )}
        </div>

        {status ? (
          <p className="text-[15px] font-medium">{status}…</p>
        ) : (
          <>
            <p className="display text-lg">Adicionar livro</p>
            <p className="mt-0.5 text-sm text-muted">
              <span className="hidden sm:inline">Arraste um PDF aqui ou </span>
              toque para escolher
            </p>
          </>
        )}
      </div>

      {error && <Aviso tipo="erro">{error}</Aviso>}
    </div>
  );
}
