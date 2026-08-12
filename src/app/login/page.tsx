import { Suspense } from "react";
import LoginForm from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-2xl text-white">
            📖
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Leitor de PDF
          </h1>
          <p className="mt-1 text-sm text-muted">
            Sua biblioteca, suas marcações, sua página.
          </p>
        </div>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
