import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string; config?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-950 p-5 text-white">
      <div className="absolute inset-x-0 top-0 h-1 bg-violet-600" />
      <div className="absolute left-[10%] top-[18%] h-56 w-56 rounded-full bg-violet-700/20 blur-3xl" />
      <Card className="relative w-full max-w-md border-slate-800 bg-slate-950 shadow-[0_28px_80px_rgba(0,0,0,0.42)]">
        <CardHeader className="p-7 pb-4">
          <div className="mb-8 grid h-10 w-10 place-items-center rounded-lg bg-violet-600 font-black text-white">
            P
          </div>
          <p className="text-sm font-semibold text-violet-300">Postgres Observer</p>
          <CardTitle className="mt-2 text-3xl tracking-[-0.035em]">
            Operational data stays private.
          </CardTitle>
          <p className="mt-3 text-sm leading-6 text-slate-300">
            Enter the dashboard password configured for this Railway service.
          </p>
        </CardHeader>
        <CardContent className="p-7 pt-3">
          <form action="/api/auth" method="post" className="space-y-4">
            <input type="hidden" name="next" value={params.next || "/"} />
            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-semibold">
                Dashboard password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                autoFocus
                disabled={params.config === "missing"}
                className="min-h-12 w-full rounded-md border border-slate-600 bg-slate-900 px-3 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400"
              />
              {params.error && (
                <p role="alert" className="mt-2 text-sm font-medium text-red-300">
                  The password did not match. Check the configured value and try again.
                </p>
              )}
              {params.config === "missing" && (
                <p role="alert" className="mt-2 text-sm font-medium text-amber-300">
                  Add DASHBOARD_PASSWORD to this Railway service before opening the dashboard.
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={params.config === "missing"}
              className="min-h-12 w-full rounded-md bg-white px-4 text-sm font-bold text-slate-950 transition-colors hover:bg-slate-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
            >
              Open dashboard
            </button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
