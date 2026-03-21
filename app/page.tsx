"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface ShowResult {
  date: string;
  venue: string;
  city: string;
  state: string;
  archive_url: string;
  match_pct: number;
  matched_songs: string[];
  missing_songs: string[];
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function MatchBadge({ pct }: { pct: number }) {
  let color = "bg-red-700 text-red-100";
  if (pct === 100) color = "bg-green-700 text-green-100";
  else if (pct >= 75) color = "bg-yellow-600 text-yellow-100";
  else if (pct >= 50) color = "bg-orange-600 text-orange-100";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${color}`}>
      {pct}%
    </span>
  );
}

function ShowRow({ show }: { show: ShowResult }) {
  const [tooltipVisible, setTooltipVisible] = useState(false);

  const location =
    show.city && show.state
      ? `${show.city}, ${show.state}`
      : show.city || show.state;

  const venueDisplay = [show.venue, location].filter(Boolean).join(" — ");

  const inner = (
    <tr
      className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors cursor-pointer"
      onMouseEnter={() => setTooltipVisible(true)}
      onMouseLeave={() => setTooltipVisible(false)}
    >
      <td className="py-2.5 pr-3 text-slate-300 whitespace-nowrap text-xs sm:text-sm">
        {formatDate(show.date)}
      </td>
      <td className="py-2.5 pr-3 text-slate-100 text-xs sm:text-sm">
        <span className="line-clamp-2 sm:line-clamp-1">{venueDisplay}</span>
      </td>
      <td className="py-2.5">
        <div className="relative inline-block">
          <MatchBadge pct={show.match_pct} />
          {tooltipVisible && (
            <div className="absolute right-0 sm:left-full sm:right-auto sm:ml-2 top-full sm:top-1/2 sm:-translate-y-1/2 mt-1 sm:mt-0 z-50 w-52 bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl text-xs pointer-events-none">
              {show.matched_songs.map((s) => (
                <div key={s} className="text-green-400">✓ {s}</div>
              ))}
              {show.missing_songs.map((s) => (
                <div key={s} className="text-red-400">✗ {s}</div>
              ))}
            </div>
          )}
        </div>
      </td>
    </tr>
  );

  if (show.archive_url) {
    return (
      <a href={show.archive_url} target="_blank" rel="noopener noreferrer" style={{ display: "contents" }}>
        {inner}
      </a>
    );
  }
  return inner;
}

export default function Home() {
  const [selectedSongs, setSelectedSongs] = useState<string[]>([]);
  const [shows, setShows] = useState<ShowResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingOpen, setAddingOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch suggestions
  useEffect(() => {
    if (!addingOpen) return;
    setSuggestionsLoading(true);
    setSuggestionsError(false);
    const controller = new AbortController();
    const url = `/api/songs?q=${encodeURIComponent(query)}`;
    fetch(url, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: { songs: string[] }) => {
        setSuggestions(data.songs.slice(0, 20));
        setSuggestionsLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setSuggestionsError(true);
          setSuggestionsLoading(false);
        }
      });
    return () => controller.abort();
  }, [query, addingOpen]);

  // Auto-focus on open
  useEffect(() => {
    if (addingOpen) setTimeout(() => inputRef.current?.focus(), 10);
  }, [addingOpen]);

  // Click-outside closes dropdown
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setAddingOpen(false);
        setQuery("");
      }
    }
    if (addingOpen) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [addingOpen]);

  // Search when setlist changes
  useEffect(() => {
    if (selectedSongs.length === 0) { setShows([]); return; }
    setLoading(true);
    fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songs: selectedSongs }),
    })
      .then((r) => r.json())
      .then((data: { shows: ShowResult[] }) => { setShows(data.shows); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedSongs]);

  const addSong = useCallback((song: string) => {
    if (!selectedSongs.includes(song)) setSelectedSongs((p) => [...p, song]);
    setAddingOpen(false);
    setQuery("");
  }, [selectedSongs]);

  const removeSong = (song: string) =>
    setSelectedSongs((p) => p.filter((s) => s !== song));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="px-4 pt-6 pb-4 sm:px-8 sm:pt-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-amber-400 tracking-tight">
          🎸 Grateful Dead Setlist Finder
        </h1>
        <p className="text-slate-400 mt-1 text-sm">
          Build your dream setlist. Find the shows that played it.
        </p>
      </header>

      {/* Main — stacked on mobile, side-by-side on sm+ */}
      <main className="px-4 pb-8 sm:px-8 flex flex-col sm:flex-row gap-4 sm:gap-6 items-start">

        {/* Left panel — setlist builder */}
        <div className="w-full sm:w-72 sm:shrink-0 bg-slate-900 rounded-xl p-4 sm:p-5">
          <h2 className="text-base sm:text-lg font-semibold text-slate-100 mb-3">
            Your Setlist
          </h2>

          {selectedSongs.length === 0 ? (
            <p className="text-slate-500 text-sm mb-3">No songs added yet.</p>
          ) : (
            <ul className="space-y-1 mb-3">
              {selectedSongs.map((song) => (
                <li
                  key={song}
                  className="flex items-center justify-between gap-2 bg-slate-800 rounded px-3 py-2 text-sm"
                >
                  <span className="truncate">{song}</span>
                  <button
                    onClick={() => removeSong(song)}
                    className="text-slate-500 hover:text-red-400 shrink-0 font-bold"
                    aria-label={`Remove ${song}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Add song autocomplete */}
          <div className="relative" ref={dropdownRef}>
            {!addingOpen ? (
              <button
                onClick={() => setAddingOpen(true)}
                className="w-full text-sm border border-dashed border-slate-600 hover:border-amber-400 hover:text-amber-400 text-slate-400 rounded-lg py-2 px-3 transition-colors"
              >
                + Add Song
              </button>
            ) : (
              <div className="bg-slate-800 rounded-lg overflow-hidden shadow-xl ring-1 ring-slate-700">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { setAddingOpen(false); setQuery(""); }
                  }}
                  placeholder="Search songs..."
                  className="w-full bg-slate-800 text-slate-100 placeholder-slate-500 px-3 py-2.5 text-sm outline-none border-b border-slate-700"
                />
                <ul className="max-h-64 overflow-y-auto">
                  {suggestionsLoading && (
                    <li className="px-3 py-2 text-xs text-slate-500">Loading…</li>
                  )}
                  {suggestionsError && (
                    <li className="px-3 py-2 text-xs text-red-400">Failed to load songs. Try again.</li>
                  )}
                  {!suggestionsLoading && !suggestionsError && suggestions.length === 0 && (
                    <li className="px-3 py-2 text-xs text-slate-500">No songs found.</li>
                  )}
                  {!suggestionsLoading && !suggestionsError &&
                    suggestions.map((song) => {
                      const already = selectedSongs.includes(song);
                      return (
                        <li key={song}>
                          <button
                            onClick={() => !already && addSong(song)}
                            disabled={already}
                            className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                              already
                                ? "text-slate-600 cursor-default"
                                : "text-slate-100 hover:bg-slate-700"
                            }`}
                          >
                            {song}
                            {already && <span className="ml-2 text-xs text-slate-600">added</span>}
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Right panel — results */}
        <div className="w-full flex-1 min-w-0 bg-slate-900 rounded-xl p-4 sm:p-5">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-base sm:text-lg font-semibold text-slate-100">
              Matching Shows
            </h2>
            {shows.length > 0 && (
              <span className="bg-amber-600 text-amber-100 text-xs font-bold px-2 py-0.5 rounded-full">
                {shows.length}
              </span>
            )}
          </div>

          {loading ? (
            <p className="text-slate-400 text-sm">Searching…</p>
          ) : selectedSongs.length === 0 ? (
            <p className="text-slate-500 text-sm">Add songs to your setlist to find matching shows.</p>
          ) : shows.length === 0 ? (
            <p className="text-slate-500 text-sm">No matching shows found.</p>
          ) : (
            <div className="overflow-x-auto -mx-1">
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr className="text-slate-400 text-xs uppercase tracking-wider">
                    <th className="text-left pb-2 pr-3 font-medium border-b border-slate-700 whitespace-nowrap">Date</th>
                    <th className="text-left pb-2 pr-3 font-medium border-b border-slate-700">Show</th>
                    <th className="text-left pb-2 font-medium border-b border-slate-700">Match</th>
                  </tr>
                </thead>
                <tbody>
                  {shows.map((show, i) => (
                    <ShowRow key={`${show.date}-${i}`} show={show} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
