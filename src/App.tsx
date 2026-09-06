import { useState } from "react";
import { SportProvider, useSport } from "./context/SportContext";
import { SportToggle } from "./components/SportToggle";
import { GamesPage } from "./pages/GamesPage";
import { TrackRecordPage } from "./pages/TrackRecordPage";

type Tab = "games" | "track-record";

function AppShell() {
  const [tab, setTab] = useState<Tab>("games");
  const { sport } = useSport();

  return (
    <div className="mx-auto min-h-screen max-w-6xl px-6 py-8" data-sport={sport}>
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="clip-corner flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-sp-gold to-sp-600 font-black text-sp-950">SP</div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight text-sp-text">Sports Predictor</h1>
            <p className="text-xs text-sp-text-faint">NFL &amp; CFB game and player predictions</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <SportToggle />
          <nav className="flex gap-1 rounded-lg border border-sp-border bg-sp-850/60 p-1">
            {([["games","Games"],["track-record","Track Record"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)} className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${tab === key ? "bg-sp-gold text-sp-950" : "text-sp-text-dim hover:text-sp-text"}`}>{label}</button>
            ))}
          </nav>
        </div>
      </header>
      <main>{tab === "games" ? <GamesPage /> : <TrackRecordPage />}</main>
    </div>
  );
}

function App() {
  return <SportProvider><AppShell /></SportProvider>;
}

export default App;
