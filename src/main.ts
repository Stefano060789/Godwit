import './style.css'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="min-h-screen bg-slate-950 text-slate-100">
    <div class="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-16">
      <div class="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl shadow-indigo-950/40 backdrop-blur-sm">
        <p class="mb-3 inline-flex rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">
          Godwit
        </p>
        <h1 class="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Build faster with Tailwind in Vite
        </h1>
        <p class="mt-4 text-lg text-slate-300">
          Tailwind is now configured successfully for this project. You can start styling the app with utility classes immediately.
        </p>
        <div class="mt-8 flex flex-wrap gap-4">
          <button class="rounded-lg bg-indigo-500 px-5 py-3 font-medium text-white transition hover:bg-indigo-400">
            Vote now
          </button>
          <button class="rounded-lg border border-slate-700 bg-slate-800 px-5 py-3 font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-700">
            View results
          </button>
        </div>
      </div>
    </div>
  </main>
`
