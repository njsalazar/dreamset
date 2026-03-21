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
    month: "long",
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

  const location = [
    show.city && show.state ? `${show.city}, ${show.state}` : show.city || show.state,
  ]
    .filter(Boolean)
    .join("");

  const venueDisplay = [show.venue, location].filter(Boolean).join(" \u2014 ");

  const rowContent = (
    <tr
      className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
      onMouseEnter={() => setTooltipVisible(true)}
      onMouseLeave={() => setTooltipVisible(false)}
    >
      <td className="py-2.5 pr-4 text-slate-300 whitespace-nowrap">
        {formatDate(show.date)}
      </td>
      <td className="py-2.5 pr-4 text-slate-100 max-w-xs">
        <span className="block truncate">{venueDisplay}</span>
      </td>
      <td className="py-2.5">
        <div className="relative inline-block">
          <MatchBadge pct={show.match_pct} />
          {tooltipVisible && (
            <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 w-60 bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-xl text-xs pointer-events-none">
              {show.matched_songs.length > 0 && (
                <div className="mb-1 space-y-0.5">
                  {show.matched_songs.map((s) => (
                    <div key={s} className="text-green-400">
                      ✓ {s}
                    </div>
                  ))}
                </div>
              )}
              {show.missing_songs.length > 0 && (
                <div className="space-y-0.5">
                  {show.missing_songs.map((s) => (
                    <div key={s} className="text-red-400">
                      ✗ {s}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </td>
    </tr>
  );

  if (show.archive_url) {
    return (
      <a href={show.archive_url} target="_blank" rel="noopener noreferrer" style={{ display: "contents" }}>
        {rowContent}
      </a>
    );
  }

  return rowContent;
}

export default function Home() {
  const [selectedSongs, setSelectedSongs] = useState<string[]>([]);
  const [shows, setShows] = useState<ShowResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingOpen, setAddingOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch suggestions when query changes
  useEffect(() => {
    if (!addingOpen) return;
    setSuggestionsLoading(true);
    const controller = new AbortController();
    fetch(`/api/songs?q=${encodeURIComponent(query)}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { songs: string[] }) => {
        setSuggestions(data.songs.slice(0, 20));
        setSuggestionsLoading(false);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [query, addingOpen]);

  // Auto-focus when dropdown opens
  useEffect(() => {
    if (addingOpen) {
      setTimeout(() => inputRef.current?.focus(), 10);
    }
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
    if (selectedSongs.length === 0) {
      setShows([]);
      return;
    }
    setLoading(true);
    fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songs: selectedSongs }),
    })
      .then((r) => r.json())
      .then((data: { shows: ShowResult[] }) => {
        setShows(data.shows);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedSongs]);

  const addSong = useCallback(
    (song: string) => {
      if (!selectedSongs.includes(song)) {
        setSelectedSongs((prev) => [...prev, song]);
      }
      setAddingOpen(false);
      setQuery("");
    },
    [selectedSongs]
  );

  const removeSong = (song: string) =>
    setSelectedSongs((prev) => prev.filter((s) => s !== song));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-amber-400 tracking-tight">
          Grateful Dead Setlist Finder
        </h1>
        <p className="text-slate-400 mt-1 text-sm">
          Build your dream setlist and find the shows that played it.
        </p>
      </header>

      <div className="flex gap-6 items-start">
        {/* Left panel — setlist builder */}
        <div className="w-72 shrink-0 bg-slate-900 rounded-xl p-5">
          <h2 className="text-lg font-semibold text-slate-100 mb-4">
            Build Your Setlist
          </h2>

          {selectedSongs.length === 0 ? (
            <p className="text-slate-500 text-sm mb-4">No songs added yet.</p>
          ) : (
            <ul className="space-y-1 mb-4">
              {selectedSongs.map((song) => (
                <li
                  key={song}
                  className="flex items-center justify-between gap-2 bg-slate-800 rounded px-3 py-2 text-sm"
                >
                  <span className="truncate">{song}</span>
                  <button
                    onClick={() => removeSong(song)}
                    className="text-slate-500 hover:text-red-400 shrink-0 text-xs font-bold"
                    aria-label={`Remove ${song}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          {/* Add song / autocomplete */}
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
                    if (e.key === "Escape") {
                      setAddingOpen(false);
                      setQuery("");
                    }
                  }}
                  placeholder="Search songs..."
                  className="w-full bg-slate-800 text-slate-100 placeholder-slate-500 px-3 py-2 text-sm outline-none border-b border-slate-700"
                />
                <ul className="max-h-64 overflow-y-auto">
                  {suggestionsLoading && (
                    <li className="px-3 py-2 text-xs text-slate-500">Loading…</li>
                  )}
                  {!suggestionsLoading && suggestions.length === 0 && (
                    <li className="px-3 py-2 text-xs text-slate-500">No songs found.</li>
                  )}
                  {!suggestionsLoading &&
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
                            {already && (
                              <span className="ml-2 text-xs text-slate-600">
                                added
                              </span>
                            )}
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
        <div className="flex-1 min-w-0 bg-slate-900 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-lg font-semibold text-slate-100">Matching Shows</h2>
            {shows.length > 0 && (
              <span className="bg-amber-600 text-amber-100 text-xs font-bold px-2 py-0.5 rounded-full">
                {shows.length}
              </span>
            )}
          </div>

          {loading ? (
            <p className="text-slate-400 text-sm">Searching…</p>
          ) : selectedSongs.length === 0 ? (
            <p className="text-slate-500 text-sm">
              Add songs to your setlist to find matching shows.
            </p>
          ) : shows.length === 0 ? (
            <p className="text-slate-500 text-sm">No matching shows found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-separate border-spacing-0">
                <thead>
                  <tr className="text-slate-400 text-xs uppercase tracking-wider">
                    <th className="text-left pb-2 pr-4 font-medium border-b border-slate-700">
                      Date
                    </th>
                    <th className="text-left pb-2 pr-4 font-medium border-b border-slate-700">
                      Show
                    </th>
                    <th className="text-left pb-2 font-medium border-b border-slate-700">
                      Match %
                    </th>
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
      </div>
    </div>
  );
}
