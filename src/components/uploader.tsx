"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { inspecionarPdf } from "@/lib/pdf";

export default function Uploader() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function enviar(files: FileList | File[]) {
    const lista = Array.from(files).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (!lista.length) {
      setError("Selecione um arquivo PDF.");
      return;
    }

    setError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Sessão expirada. Faça login de novo.");
      return;
    }

    for (const [i, file] of lista.entries()) {
      const rotulo = lista.length > 1 ? `(${i + 1}/${lista.length}) ` : "";
      try {
        setStatus(`${rotulo}Lendo ${file.name}...`);
        const { totalPages, cover } = await inspecionarPdf(file);

        const id = crypto.randomUUID();
        const pdfPath = `${user.id}/${id}.pdf`;

        setStatus(`${rotulo}Enviando ${file.name}...`);
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
        setError(`Falha em ${file.name}: ${(e as Error).message}`);
        setStatus(null);
        return;
      }
    }

    setStatus(null);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
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
      className={`rounded-2xl border-2 border-dashed p-6 text-center transition ${
        dragging ? "border-accent bg-accent/5" : "border-border bg-surface"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        multiple
        hidden
        onChange={(e) => e.target.files && void enviar(e.target.files)}
      />
      <p className="text-sm text-muted">
        Arraste PDFs aqui ou{" "}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="font-semibold text-accent underline-offset-2 hover:underline"
          disabled={!!status}
        >
          escolha do computador
        </button>
      </p>
      {status && <p className="mt-2 text-sm font-medium">{status}</p>}
      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
}
