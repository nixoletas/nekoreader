"use client";

import { useEffect } from "react";

export default function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const id = setTimeout(() => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }, 1200);
    return () => clearTimeout(id);
  }, []);

  return null;
}
