import { ImageResponse } from "next/og";

const PERMITIDOS = new Set([180, 192, 512]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size } = await params;
  const s = Number(size);
  if (!PERMITIDOS.has(s)) return new Response("Not found", { status: 404 });

  // Livro estilizado: lombada + páginas. Sem texto, sem fonte externa.
  const u = s / 100;

  return new ImageResponse(
    (
      <div
        style={{
          width: s,
          height: s,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f4eee2",
        }}
      >
        <div
          style={{
            width: s * 0.56,
            height: s * 0.68,
            display: "flex",
            borderRadius: `${u * 3}px ${u * 8}px ${u * 8}px ${u * 3}px`,
            overflow: "hidden",
            boxShadow: `0 ${u * 4}px ${u * 10}px rgba(80,50,20,0.25)`,
          }}
        >
          <div style={{ width: s * 0.14, height: "100%", background: "#a33f27" }} />
          <div
            style={{
              flex: 1,
              height: "100%",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: u * 6,
              padding: u * 8,
              background: "#fffdf7",
            }}
          >
            <div style={{ height: u * 4, background: "#d8cbb4", borderRadius: u * 2 }} />
            <div style={{ height: u * 4, background: "#f2c14e", borderRadius: u * 2 }} />
            <div style={{ height: u * 4, background: "#d8cbb4", borderRadius: u * 2 }} />
            <div
              style={{
                height: u * 4,
                width: "60%",
                background: "#d8cbb4",
                borderRadius: u * 2,
              }}
            />
          </div>
        </div>
      </div>
    ),
    { width: s, height: s },
  );
}
