import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  adminLogout,
  backfillGeo,
  getAdminStats,
  getAdminToken,
  getAdminUsers,
} from "./api/admin";
import {
  BarChart,
  Histogram,
  PieChart,
  ScatterPlot,
} from "./components/AdminCharts";
import "./AdminDashboard.css";

const formatNumber = (n) =>
  Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });

const formatDuration = (totalSeconds) => {
  const s = Math.max(0, Math.floor(Number(totalSeconds || 0)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
};

const flagFromCode = (code) => {
  if (!code || code.length !== 2) return "";
  const base = 0x1f1e6 - "A".charCodeAt(0);
  return String.fromCodePoint(
    code.charCodeAt(0) + base,
    code.charCodeAt(1) + base
  );
};

const formatDate = (iso) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
};

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState("");
  const [expandedUser, setExpandedUser] = useState(null);

  const load = useCallback(async () => {
    setError("");
    try {
      const [statsData, usersData] = await Promise.all([
        getAdminStats(),
        getAdminUsers().catch((e) => {
          if (/Session expired/i.test(e.message || "")) throw e;
          return { users: [] };
        }),
      ]);
      setStats(statsData);
      setUsers(usersData.users || []);
    } catch (e) {
      setError(e.message || "Could not load stats");
      if (/Session expired/i.test(e.message || "")) {
        navigate("/admin/login", { replace: true });
      }
    }
  }, [navigate]);

  useEffect(() => {
    if (!getAdminToken()) {
      navigate("/admin/login", { replace: true });
      return;
    }
    (async () => {
      setLoading(true);
      await load();
      setLoading(false);
    })();
  }, [navigate, load]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleLogout = async () => {
    await adminLogout();
    navigate("/admin/login", { replace: true });
  };

  const handleBackfill = async () => {
    setBackfilling(true);
    setBackfillMsg("");
    try {
      const res = await backfillGeo();
      setBackfillMsg(
        res.updated > 0
          ? `Updated ${res.updated} user${res.updated === 1 ? "" : "s"} with country info.`
          : "No users needed updating."
      );
      await load();
    } catch (e) {
      setBackfillMsg(e.message || "Backfill failed");
    } finally {
      setBackfilling(false);
    }
  };

  if (loading) {
    return (
      <div className="ad-page ad-page--center">
        <div className="ad-loading">Loading admin dashboard…</div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="ad-page ad-page--center">
        <div className="ad-error-box">
          <h2>Could not load dashboard</h2>
          <p>{error}</p>
          <button className="ad-btn" onClick={handleRefresh}>Try again</button>
          <button className="ad-btn ad-btn--ghost" onClick={() => navigate("/admin/login")}>
            Sign in again
          </button>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const totals = stats.totals || {};
  const trend = stats.signup_trend || [];
  const countries = stats.countries || [];
  const recent = stats.recent_users || [];
  const top = stats.top_users || [];
  const maxTrend = trend.reduce((m, p) => Math.max(m, p.count), 0) || 1;
  const maxCountry = countries.reduce((m, c) => Math.max(m, c.count), 0) || 1;
  const totalUsers = totals.total_users || 0;

  // ── Chart-ready datasets derived from the full users list ─────────────────
  const docsByUser = users
    .filter((u) => u.document_count > 0)
    .map((u) => ({
      label: shortName(u),
      value: u.document_count,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  const docTypeTotals = {};
  users.forEach((u) => {
    Object.entries(u.document_types || {}).forEach(([k, v]) => {
      docTypeTotals[k] = (docTypeTotals[k] || 0) + v;
    });
  });
  const docTypePie = Object.entries(docTypeTotals)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);

  const daysAsUserValues = users
    .map((u) => u.days_as_user)
    .filter((v) => v !== null && v !== undefined);

  const scatterPoints = users.map((u) => ({
    label: shortName(u) || `User #${u.id}`,
    x: u.days_as_user || 0,
    y: Math.round((u.total_seconds || 0) / 60),
  }));

  const activityScatter = users.map((u) => ({
    label: shortName(u) || `User #${u.id}`,
    x: u.chat_sessions || 0,
    y: u.chat_messages || 0,
  }));

  return (
    <div className="ad-page">
      <header className="ad-header">
        <div>
          <h1 className="ad-h1">Admin Dashboard</h1>
          <p className="ad-sub">
            Generated {formatDate(stats.generated_at)} · Laboracle
          </p>
        </div>
        <div className="ad-header-actions">
          <button
            type="button"
            className="ad-btn ad-btn--ghost"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            className="ad-btn ad-btn--ghost"
            onClick={handleBackfill}
            disabled={backfilling}
            title="Look up country/city for users that registered before geo tracking"
          >
            {backfilling ? "Backfilling…" : "Backfill geo"}
          </button>
          <button type="button" className="ad-btn ad-btn--danger" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      {error && <div className="ad-banner ad-banner--error">{error}</div>}
      {backfillMsg && <div className="ad-banner">{backfillMsg}</div>}

      <section className="ad-cards">
        <Card label="Total users"     value={formatNumber(totals.total_users)}      accent="blue" />
        <Card label="New today"        value={formatNumber(totals.users_today)}       accent="green" />
        <Card label="New (7 days)"     value={formatNumber(totals.users_last_7_days)} accent="cyan" />
        <Card label="New (30 days)"    value={formatNumber(totals.users_last_30_days)} accent="violet" />
        <Card label="Active today"     value={formatNumber(totals.active_users_today)} accent="amber" />
        <Card label="Time spent today" value={formatDuration(totals.total_seconds_today)} accent="rose" />
        <Card label="Chat sessions"    value={formatNumber(totals.total_chat_sessions)} accent="teal" />
        <Card label="Chat messages"    value={formatNumber(totals.total_chat_messages)} accent="indigo" />
      </section>

      <div className="ad-row">
        <section className="ad-panel ad-panel--wide">
          <h2 className="ad-panel-title">Signups — last 30 days</h2>
          {trend.length === 0 ? (
            <p className="ad-empty">No signups in the last 30 days.</p>
          ) : (
            <div className="ad-chart">
              {trend.map((p) => (
                <div className="ad-chart-col" key={p.day} title={`${p.day}: ${p.count}`}>
                  <div
                    className="ad-chart-bar"
                    style={{ height: `${(p.count / maxTrend) * 100}%` }}
                  >
                    {p.count > 0 && <span className="ad-chart-label">{p.count}</span>}
                  </div>
                  <span className="ad-chart-x">{shortDay(p.day)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="ad-panel">
          <h2 className="ad-panel-title">Where users are from</h2>
          {countries.length === 0 ? (
            <p className="ad-empty">No country data yet.</p>
          ) : (
            <ul className="ad-country-list">
              {countries.map((c, idx) => (
                <li key={`${c.country}-${idx}`} className="ad-country-row">
                  <span className="ad-country-name">
                    <span className="ad-flag">{flagFromCode(c.country_code) || "🌐"}</span>
                    {c.country}
                  </span>
                  <div className="ad-country-bar">
                    <div
                      className="ad-country-bar-fill"
                      style={{ width: `${(c.count / maxCountry) * 100}%` }}
                    />
                  </div>
                  <span className="ad-country-count">
                    {c.count}
                    <span className="ad-country-pct">
                      {totalUsers > 0
                        ? ` · ${Math.round((c.count / totalUsers) * 100)}%`
                        : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="ad-row">
        <section className="ad-panel">
          <h2 className="ad-panel-title">Recent signups</h2>
          {recent.length === 0 ? (
            <p className="ad-empty">No users yet.</p>
          ) : (
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Location</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((u) => (
                  <tr key={u.id}>
                    <td>{(u.first_name + " " + u.last_name).trim() || `User #${u.id}`}</td>
                    <td className="ad-mono">{u.email}</td>
                    <td>
                      {u.country
                        ? `${u.city ? u.city + ", " : ""}${u.country}`
                        : "—"}
                    </td>
                    <td className="ad-mono">{formatDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="ad-panel">
          <h2 className="ad-panel-title">Top users by time spent</h2>
          {top.length === 0 ? (
            <p className="ad-empty">No usage data yet.</p>
          ) : (
            <table className="ad-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {top.map((u, idx) => (
                  <tr key={u.id}>
                    <td>{idx + 1}</td>
                    <td>{(u.first_name + " " + u.last_name).trim() || `User #${u.id}`}</td>
                    <td className="ad-mono">{u.email}</td>
                    <td>{formatDuration(u.total_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <div className="ad-row">
        <section className="ad-panel">
          <h2 className="ad-panel-title">Documents uploaded — top 10 users</h2>
          <BarChart
            data={docsByUser}
            xLabel="User"
            yLabel="Documents"
            height={260}
          />
        </section>
        <section className="ad-panel">
          <h2 className="ad-panel-title">Document type mix</h2>
          <PieChart data={docTypePie} size={220} />
        </section>
      </div>

      <div className="ad-row">
        <section className="ad-panel">
          <h2 className="ad-panel-title">
            Days as a user — histogram
          </h2>
          <Histogram
            values={daysAsUserValues}
            bins={6}
            xLabel="Days since signup"
            yLabel="Users"
            formatBin={(lo, hi) => `${Math.round(lo)}–${Math.round(hi)}d`}
          />
        </section>
        <section className="ad-panel">
          <h2 className="ad-panel-title">
            Days as user vs minutes spent — scatter
          </h2>
          <ScatterPlot
            points={scatterPoints}
            xLabel="Days as user"
            yLabel="Minutes spent"
            height={280}
          />
        </section>
      </div>

      <div className="ad-row">
        <section className="ad-panel ad-panel--wide">
          <h2 className="ad-panel-title">
            Chat sessions vs messages — scatter
          </h2>
          <ScatterPlot
            points={activityScatter}
            xLabel="Chat sessions"
            yLabel="Messages sent"
            height={260}
          />
        </section>
      </div>

      <section className="ad-panel ad-users-panel">
        <div className="ad-users-panel-header">
          <h2 className="ad-panel-title">Every user — full details</h2>
          <span className="ad-users-count">{users.length} total</span>
        </div>
        {users.length === 0 ? (
          <p className="ad-empty">No users yet.</p>
        ) : (
          <div className="ad-users-scroll">
            <table className="ad-table ad-table--users">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Location</th>
                  <th>Joined</th>
                  <th>Member</th>
                  <th>Time spent</th>
                  <th>Sessions</th>
                  <th>Messages</th>
                  <th>Documents</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, idx) => {
                  const name =
                    (u.first_name + " " + u.last_name).trim() || `User #${u.id}`;
                  const isOpen = expandedUser === u.id;
                  return (
                    <React.Fragment key={u.id}>
                      <tr>
                        <td>{idx + 1}</td>
                        <td>{name}</td>
                        <td className="ad-mono">{u.email}</td>
                        <td className="ad-mono">{u.phone || "—"}</td>
                        <td>
                          {u.country ? (
                            <>
                              <span className="ad-flag">
                                {flagFromCode(u.country_code) || "🌐"}
                              </span>{" "}
                              {u.city ? `${u.city}, ` : ""}
                              {u.country}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="ad-mono">{formatDate(u.created_at)}</td>
                        <td>
                          {u.days_as_user != null
                            ? `${u.days_as_user}d`
                            : "—"}
                        </td>
                        <td>{formatDuration(u.total_seconds)}</td>
                        <td>{u.chat_sessions}</td>
                        <td>{u.chat_messages}</td>
                        <td>
                          <span className="ad-doc-pill">
                            {u.document_count}
                          </span>
                          {u.total_document_kb > 0 && (
                            <span className="ad-doc-size">
                              · {formatKb(u.total_document_kb)}
                            </span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="ad-btn ad-btn--ghost ad-btn--xs"
                            onClick={() =>
                              setExpandedUser(isOpen ? null : u.id)
                            }
                            disabled={u.document_count === 0}
                            title={
                              u.document_count === 0
                                ? "No documents uploaded"
                                : "Show documents"
                            }
                          >
                            {isOpen ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>
                      {isOpen && u.documents && u.documents.length > 0 && (
                        <tr className="ad-doc-row">
                          <td colSpan={12}>
                            <table className="ad-table ad-table--inner">
                              <thead>
                                <tr>
                                  <th>File</th>
                                  <th>Type</th>
                                  <th>Chunks</th>
                                  <th>Size</th>
                                  <th>Uploaded</th>
                                </tr>
                              </thead>
                              <tbody>
                                {u.documents.map((d) => (
                                  <tr key={d.document_id}>
                                    <td className="ad-mono">
                                      {d.original_filename || d.filename}
                                    </td>
                                    <td>{d.doc_type || "—"}</td>
                                    <td>{d.total_chunks}</td>
                                    <td>{formatKb(d.file_size_kb)}</td>
                                    <td className="ad-mono">
                                      {formatDate(d.chunked_at)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

const shortName = (u) => {
  const name = ((u.first_name || "") + " " + (u.last_name || "")).trim();
  if (name) return name;
  if (u.email) return u.email.split("@")[0];
  return `User #${u.id}`;
};

const formatKb = (kb) => {
  const n = Number(kb || 0);
  if (n >= 1024) return `${(n / 1024).toFixed(1)} MB`;
  return `${n.toFixed(1)} KB`;
};

const Card = ({ label, value, accent }) => (
  <div className={`ad-card ad-card--${accent || "blue"}`}>
    <span className="ad-card-label">{label}</span>
    <span className="ad-card-value">{value}</span>
  </div>
);

const shortDay = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export default AdminDashboard;
