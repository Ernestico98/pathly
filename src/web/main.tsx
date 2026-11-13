import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, NavLink, Route, Routes } from "react-router";
import Analytics from "./pages/Analytics";
import Dashboard from "./pages/Dashboard";
import NewEntry from "./pages/NewEntry";
import NewProcess from "./pages/NewProcess";
import ProcessDetail from "./pages/ProcessDetail";
import Processes from "./pages/Processes";
import Settings from "./pages/Settings";
import "./styles.css";

const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1, refetchOnWindowFocus: false } } });

const NAV = [
  { to: "/", label: "Overview", end: true },
  { to: "/processes", label: "Processes" },
  { to: "/analytics", label: "Analytics" },
  { to: "/settings", label: "Settings" },
];

function Layout() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5">
          <NavLink to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <svg viewBox="0 0 32 32" className="h-6 w-6" aria-hidden>
              <rect width="32" height="32" rx="8" fill="var(--accent)" />
              <path d="M8 22 L14 14 L18 18 L24 9" stroke="white" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Pathly
          </NavLink>
          <nav className="order-last -mx-2 flex w-full gap-1 overflow-x-auto sm:order-none sm:mx-0 sm:w-auto sm:flex-1" aria-label="Main">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.end}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm ${isActive ? "bg-surface-2 font-medium text-text" : "text-text-2 hover:text-text"}`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <NavLink to="/processes/new" className="btn btn-primary ml-auto sm:ml-0">
            + <span className="hidden sm:inline">New process</span><span className="sm:hidden">New</span>
          </NavLink>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/processes" element={<Processes />} />
          <Route path="/processes/new" element={<NewProcess />} />
          <Route path="/processes/:id" element={<ProcessDetail />} />
          <Route path="/processes/:id/entry" element={<NewEntry />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<p className="text-text-2">Page not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Layout />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
