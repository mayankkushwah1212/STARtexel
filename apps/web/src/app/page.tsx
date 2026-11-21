import { APP_CONFIG } from '@startexel/shared';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="max-w-3xl w-full text-center space-y-6">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">
          Welcome to <span className="text-blue-600 dark:text-blue-400">{APP_CONFIG.name}</span>
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-300">
          Monorepo scaffold with Next.js, NestJS, FastAPI, and shared TypeScript packages.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-6 text-left">
          <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 shadow-sm">
            <h2 className="font-semibold text-lg">Web App</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Next.js + Tailwind CSS</p>
            <p className="text-xs font-mono text-blue-500 mt-3">Port {APP_CONFIG.ports.web}</p>
          </div>

          <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 shadow-sm">
            <h2 className="font-semibold text-lg">API Service</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">NestJS API</p>
            <p className="text-xs font-mono text-blue-500 mt-3">Port {APP_CONFIG.ports.api}</p>
          </div>

          <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900 shadow-sm">
            <h2 className="font-semibold text-lg">AI Service</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">FastAPI Service</p>
            <p className="text-xs font-mono text-blue-500 mt-3">Port {APP_CONFIG.ports.ai}</p>
          </div>
        </div>
      </div>
    </main>
  );
}
