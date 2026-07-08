import { useEffect, useMemo, useState } from "react";
import {
  getDashboardGeoSummary,
  getPlatformStatus,
  getRealtimeEventsFeed,
  getWorldMonitorConfig,
  getRagSchedulerStatus,
  forceRagUpdate,
  enableRagScheduler,
  disableRagScheduler,
} from "../../api/api";

const severityClass = {
  high: "text-red-300 bg-red-500/15 border border-red-500/25",
  medium: "text-amber-200 bg-amber-500/15 border border-amber-500/25",
  low: "text-accent-400 bg-accent-500/10 border border-accent-500/20",
};

const projectPoint = (lat, lon) => {
  const x = ((lon + 180) / 360) * 100;
  const y = ((90 - lat) / 180) * 100;
  return { x, y };
};

export default function GlobalDashboard() {
  const [events, setEvents] = useState([]);
  const [regions, setRegions] = useState([]);
  const [platform, setPlatform] = useState(null);
  const [worldMonitor, setWorldMonitor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [schedulerStatus, setSchedulerStatus] = useState(null);
  const [schedulerActionLoading, setSchedulerActionLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const [feedData, geoData] = await Promise.all([
        getRealtimeEventsFeed(25, "india"),
        getDashboardGeoSummary(120, "india"),
      ]);
      setEvents(feedData?.events || []);
      setRegions(geoData?.regions || []);
      try {
        const platformStatus = await getPlatformStatus();
        setPlatform(platformStatus?.platform || null);
      } catch (statusErr) {
        console.warn("Platform status unavailable:", statusErr);
      }

      try {
        const worldMonitorConfig = await getWorldMonitorConfig();
        setWorldMonitor(worldMonitorConfig?.world_monitor || null);
      } catch (wmErr) {
        console.warn("World Monitor config unavailable:", wmErr);
      }

      try {
        const schedulerData = await getRagSchedulerStatus();
        setSchedulerStatus(schedulerData?.scheduler || null);
      } catch (schedErr) {
        console.warn("RAG scheduler status unavailable:", schedErr);
      }
    } catch (err) {
      console.error("Failed to load global dashboard:", err);
      setError("Unable to load realtime intelligence.");
    } finally {
      setLoading(false);
    }
  };

  const handleForceUpdate = async () => {
    setSchedulerActionLoading(true);
    try {
      await forceRagUpdate();
      await refresh();
    } catch (err) {
      console.error("Failed to force RAG update:", err);
    } finally {
      setSchedulerActionLoading(false);
    }
  };

  const handleToggleScheduler = async () => {
    setSchedulerActionLoading(true);
    try {
      if (schedulerStatus?.enabled) {
        await disableRagScheduler();
      } else {
        await enableRagScheduler();
      }
      await refresh();
    } catch (err) {
      console.error("Failed to toggle RAG scheduler:", err);
    } finally {
      setSchedulerActionLoading(false);
    }
  };

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 45000);
    return () => clearInterval(timer);
  }, []);

  const markers = useMemo(() => {
    return regions.slice(0, 12).map((region) => {
      const point = projectPoint(region.lat ?? 0, region.lon ?? 0);
      return {
        ...region,
        ...point,
        size: Math.max(8, Math.min(28, (region.events || 1) * 2.2)),
      };
    });
  }, [regions]);

  const availableRegions = useMemo(() => {
    const unique = new Set(events.map((event) => event.region || "Global"));
    return ["all", ...Array.from(unique)];
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      const matchesSeverity = severityFilter === "all" || (event.severity || "low") === severityFilter;
      const matchesRegion = regionFilter === "all" || (event.region || "Global") === regionFilter;
      const haystack = `${event.title || ""} ${event.summary || ""}`.toLowerCase();
      const matchesSearch = !search.trim() || haystack.includes(search.trim().toLowerCase());
      return matchesSeverity && matchesRegion && matchesSearch;
    });
  }, [events, severityFilter, regionFilter, search]);

  const kpis = useMemo(() => {
    const high = events.filter((e) => (e.severity || "low") === "high").length;
    const medium = events.filter((e) => (e.severity || "low") === "medium").length;
    const activeRegions = new Set(events.map((e) => e.region || "Global")).size;
    return {
      total: events.length,
      high,
      medium,
      activeRegions,
    };
  }, [events]);

  const statTiles = [
    { label: "Total Events", value: kpis.total },
    { label: "High Severity", value: kpis.high },
    { label: "Medium Severity", value: kpis.medium },
    { label: "Active Regions", value: kpis.activeRegions },
  ];

  const platformPills = platform
    ? [
        `Model: ${platform.model}`,
        `RAG: ${platform.rag_enabled ? `on (${platform.rag_documents} docs)` : "off"}`,
        `Scheduler: ${platform.scheduler_running ? "running" : "stopped"}`,
        `Cache hit: ${Number(platform.cache_hit_rate_percent || 0).toFixed(1)}%`,
      ]
    : [];

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-10">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="m-0 text-2xl md:text-[28px] font-bold text-[color:var(--pragna-text)]">
            World Monitor Dashboard
          </h1>
          <p className="mt-1.5 mb-0 text-sm text-[color:var(--pragna-text-muted)]">
            India-first intelligence pulse with global context
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold ${
              loading
                ? "border-accent-500/25 bg-accent-500/10 text-accent-400"
                : "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
            }`}
          >
            <span
              className={`h-[7px] w-[7px] rounded-full ${loading ? "bg-accent-500 dash-blink-dot" : "bg-emerald-400"}`}
              style={loading ? { boxShadow: "0 0 8px rgba(212,175,55,0.8)" } : undefined}
            />
            {loading ? "Syncing…" : "Live"}
          </div>
          <button
            className="rounded-[10px] border border-accent-500/35 bg-accent-500/10 px-4 py-2 text-sm font-semibold text-[color:var(--pragna-text)] shadow-premium-sm transition-colors hover:bg-accent-500/20 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={refresh}
            disabled={loading}
          >
            {loading ? "Syncing..." : "Refresh Feed"}
          </button>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3.5 md:grid-cols-4">
        {statTiles.map((stat) => (
          <div
            key={stat.label}
            className="glass-card rounded-2xl px-5 py-4.5 shadow-premium-sm"
          >
            <div className="mb-2 text-xs text-[color:var(--pragna-text-muted)]">{stat.label}</div>
            <div className="text-2xl font-bold text-[color:var(--pragna-text)]">{stat.value}</div>
          </div>
        ))}
      </div>

      {platformPills.length > 0 ? (
        <div className="mb-5 flex flex-wrap gap-2.5">
          {platformPills.map((pill) => (
            <div
              key={pill}
              className="rounded-full border border-border bg-surface-subtle px-3.5 py-1.5 text-xs text-[color:var(--pragna-text-muted)]"
            >
              {pill}
            </div>
          ))}
        </div>
      ) : null}

      {schedulerStatus ? (
        <div className="glass-card mb-5 rounded-2xl px-5 py-4.5 shadow-premium-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="m-0 text-sm font-bold text-[color:var(--pragna-text)]">RAG Scheduler</h2>
            <div className="flex gap-2">
              <button
                onClick={handleForceUpdate}
                disabled={schedulerActionLoading}
                className="rounded-lg border border-accent-500/35 bg-accent-500/10 px-3 py-1.5 text-xs font-semibold text-[color:var(--pragna-text)] transition-colors hover:bg-accent-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Force update now
              </button>
              <button
                onClick={handleToggleScheduler}
                disabled={schedulerActionLoading}
                className="rounded-lg border border-border bg-surface-subtle px-3 py-1.5 text-xs font-semibold text-[color:var(--pragna-text-muted)] transition-colors hover:bg-black/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {schedulerStatus.enabled ? "Disable" : "Enable"}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-xs text-[color:var(--pragna-text-muted)] md:grid-cols-4">
            <div>
              <div className="mb-1 text-[color:var(--pragna-text)] font-semibold">Last update</div>
              {schedulerStatus.last_update ? new Date(schedulerStatus.last_update).toLocaleString() : "Never"}
            </div>
            <div>
              <div className="mb-1 text-[color:var(--pragna-text)] font-semibold">Update count</div>
              {schedulerStatus.update_count}
            </div>
            <div>
              <div className="mb-1 text-[color:var(--pragna-text)] font-semibold">Errors</div>
              {schedulerStatus.update_errors}
            </div>
            <div>
              <div className="mb-1 text-[color:var(--pragna-text)] font-semibold">Next update</div>
              {typeof schedulerStatus.next_update_in_hours === "number" ? `${schedulerStatus.next_update_in_hours}h` : schedulerStatus.next_update_in_hours}
            </div>
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}

      <div className="mb-5 flex flex-wrap gap-2">
        <select
          className="rounded-lg border border-border bg-black/30 px-3 py-2 text-xs text-[color:var(--pragna-text)] focus-ring"
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
        >
          <option value="all">All severities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          className="rounded-lg border border-border bg-black/30 px-3 py-2 text-xs text-[color:var(--pragna-text)] focus-ring"
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
        >
          {availableRegions.map((region) => (
            <option key={region} value={region}>
              {region === "all" ? "All regions" : region}
            </option>
          ))}
        </select>
        <input
          className="min-w-[180px] flex-1 rounded-lg border border-border bg-black/30 px-3 py-2 text-xs text-[color:var(--pragna-text)] focus-ring"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search events"
        />
      </div>

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-[1.4fr_1fr]">
        <section className="glass-card rounded-2xl p-5 shadow-premium-sm">
          <h3 className="m-0 mb-3.5 text-[15px] font-semibold text-[color:var(--pragna-text)]">
            Geo Activity Map
          </h3>
          <div className="relative h-[240px] overflow-hidden rounded-xl border border-border bg-[radial-gradient(circle_at_55%_45%,rgba(212,175,55,0.16),transparent_60%)] bg-surface">
            {markers.length === 0 ? (
              <div className="flex h-full items-center justify-center">
                <span
                  className="h-2.5 w-2.5 rounded-full bg-accent-500"
                  style={{ boxShadow: "0 0 16px rgba(212,175,55,0.8)" }}
                />
              </div>
            ) : (
              markers.map((marker) => (
                <div
                  key={marker.region}
                  className="dash-blink-marker absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-500"
                  style={{
                    left: `${marker.x}%`,
                    top: `${marker.y}%`,
                    width: `${marker.size}px`,
                    height: `${marker.size}px`,
                    boxShadow: "0 0 16px rgba(212,175,55,0.65)",
                  }}
                  title={`${marker.region}: ${marker.events} events`}
                />
              ))
            )}
          </div>
          <div className="mt-3.5 grid grid-cols-2 gap-2 border-t border-border pt-3.5 sm:grid-cols-3">
            {regions.slice(0, 6).map((region) => (
              <div
                key={region.region}
                className="flex items-center justify-between rounded-lg border border-border/60 px-2.5 py-1.5 text-xs text-[color:var(--pragna-text-muted)]"
              >
                <span>{region.region}</span>
                <strong className="font-semibold text-accent-400">{region.events}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-card flex flex-col gap-3 rounded-2xl p-5 shadow-premium-sm">
          <h3 className="m-0 text-[15px] font-semibold text-[color:var(--pragna-text)]">Live Event Feed</h3>
          <div className="flex max-h-[430px] flex-col gap-2 overflow-y-auto">
            {filteredEvents.length === 0 && !loading ? (
              <div className="py-2 text-xs text-[color:var(--pragna-text-muted)]">
                No events available right now.
              </div>
            ) : (
              filteredEvents.map((event) => (
                <a
                  key={event.event_id}
                  className="rounded-xl border border-border bg-black/20 p-3.5 no-underline transition-colors hover:border-accent-500/40"
                  href={event.link || "#"}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${
                        severityClass[event.severity] || severityClass.low
                      }`}
                    >
                      {event.severity || "low"}
                    </span>
                    <span className="text-[11.5px] text-[color:var(--pragna-text-muted)]">
                      {event.region || "Global"}
                    </span>
                  </div>
                  <div className="mb-1 text-[13.5px] font-semibold text-[color:var(--pragna-text)]">
                    {event.title}
                  </div>
                  {event.summary ? (
                    <div className="text-xs leading-relaxed text-[color:var(--pragna-text-muted)]">
                      {event.summary}
                    </div>
                  ) : null}
                </a>
              ))
            )}
          </div>
        </section>
      </div>

      <section className="glass-card rounded-2xl p-5 shadow-premium-sm">
        <h3 className="m-0 mb-2 text-[15px] font-semibold text-[color:var(--pragna-text)]">
          World Monitor Integration
        </h3>
        <p className="m-0 mb-3.5 text-[13.5px] leading-relaxed text-[color:var(--pragna-text-muted)]">
          Live strategic dashboard from worldmonitor.app integrated as an external
          launch because iframe embedding is restricted by the site security policy.
        </p>
        {worldMonitor ? (
          <div className="mb-3.5 flex flex-wrap gap-2">
            <span className="rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-[11px] text-[color:var(--pragna-text-muted)]">
              Mode: {worldMonitor.integration_mode}
            </span>
            <span className="rounded-full border border-border bg-surface-subtle px-2.5 py-1 text-[11px] text-[color:var(--pragna-text-muted)]">
              Embeddable: {worldMonitor.embeddable ? "yes" : "no"}
            </span>
          </div>
        ) : null}
        <button
          className="inline-flex items-center gap-2 rounded-[11px] border border-accent-500/35 bg-accent-500/10 px-5 py-2.5 text-[13.5px] font-semibold text-accent-400 shadow-premium-sm transition-colors hover:bg-accent-500/20"
          onClick={() =>
            window.open(worldMonitor?.url || "https://www.worldmonitor.app/", "_blank", "noopener,noreferrer")
          }
        >
          Open World Monitor
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <path d="M15 3h6v6" />
            <path d="M10 14L21 3" />
          </svg>
        </button>
      </section>

      <style>{`
        @keyframes dashBlinkDot {
          0%, 80%, 100% { opacity: 0.25; }
          40% { opacity: 1; }
        }
        .dash-blink-dot {
          animation: dashBlinkDot 1.4s infinite;
        }
        @keyframes dashBlinkMarker {
          0% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.85; }
          50% { transform: translate(-50%, -50%) scale(1.1); opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(0.9); opacity: 0.85; }
        }
        .dash-blink-marker {
          animation: dashBlinkMarker 2.4s infinite;
        }
      `}</style>
    </div>
  );
}
