import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  CalendarDays,
  Clock,
  MessageCircle,
  MessagesSquare,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
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
      <div className="adm-page adm-page--center">
        <div className="adm-loading">Loading admin dashboard…</div>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="adm-page adm-page--center">
        <div className="adm-error-box">
          <h2>Could not load dashboard</h2>
          <p>{error}</p>
          <button className="adm-btn" onClick={handleRefresh}>Try again</button>
          <button className="adm-btn adm-btn--ghost" onClick={() => navigate("/admin/login")}>
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
    <div className="adm-page">
      <header className="adm-header">
        <div>
          <h1 className="adm-h1">Admin Dashboard</h1>
          <p className="adm-sub">
            Generated {formatDate(stats.generated_at)} · Laboracle
          </p>
        </div>
        <div className="adm-header-actions">
          <button
            type="button"
            className="adm-btn adm-btn--ghost"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            className="adm-btn adm-btn--ghost"
            onClick={handleBackfill}
            disabled={backfilling}
            title="Look up country/city for users that registered before geo tracking"
          >
            {backfilling ? "Backfilling…" : "Backfill geo"}
          </button>
          <button type="button" className="adm-btn adm-btn--danger" onClick={handleLogout}>
            Log out
          </button>
        </div>
      </header>

      {error && <div className="adm-banner adm-banner--error">{error}</div>}
      {backfillMsg && <div className="adm-banner">{backfillMsg}</div>}

      <section className="adm-cards">
        <Card label="Total users"     value={formatNumber(totals.total_users)}        accent="blue"   icon={Users} />
        <Card label="New today"        value={formatNumber(totals.users_today)}        accent="green"  icon={UserPlus} />
        <Card label="New (7 days)"     value={formatNumber(totals.users_last_7_days)}  accent="cyan"   icon={TrendingUp} />
        <Card label="New (30 days)"    value={formatNumber(totals.users_last_30_days)} accent="violet" icon={CalendarDays} />
        <Card label="Active today"     value={formatNumber(totals.active_users_today)} accent="amber"  icon={Activity} />
        <Card label="Time spent today" value={formatDuration(totals.total_seconds_today)} accent="rose"   icon={Clock} />
        <Card label="Chat sessions"    value={formatNumber(totals.total_chat_sessions)} accent="teal"   icon={MessagesSquare} />
        <Card label="Chat messages"    value={formatNumber(totals.total_chat_messages)} accent="indigo" icon={MessageCircle} />
      </section>

      <div className="adm-row">
        <section className="adm-panel adm-panel--wide">
          <h2 className="adm-panel-title">Signups — last 30 days</h2>
          {trend.length === 0 ? (
            <p className="adm-empty">No signups in the last 30 days.</p>
          ) : (
            <div className="adm-chart">
              {trend.map((p) => (
                <div className="adm-chart-col" key={p.day} title={`${p.day}: ${p.count}`}>
                  <div
                    className="adm-chart-bar"
                    style={{ height: `${(p.count / maxTrend) * 100}%` }}
                  >
                    {p.count > 0 && <span className="adm-chart-label">{p.count}</span>}
                  </div>
                  <span className="adm-chart-x">{shortDay(p.day)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="adm-panel">
          <h2 className="adm-panel-title">Where users are from</h2>
          {countries.length === 0 ? (
            <p className="adm-empty">No country data yet.</p>
          ) : (
            <ul className="adm-country-list">
              {countries.map((c, idx) => (
                <li key={`${c.country}-${idx}`} className="adm-country-row">
                  <span className="adm-country-name">
                    <span className="adm-flag">{flagFromCode(c.country_code) || "🌐"}</span>
                    {c.country}
                  </span>
                  <div className="adm-country-bar">
                    <div
                      className="adm-country-bar-fill"
                      style={{ width: `${(c.count / maxCountry) * 100}%` }}
                    />
                  </div>
                  <span className="adm-country-count">
                    {c.count}
                    <span className="adm-country-pct">
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

      <div className="adm-row">
        <section className="adm-panel">
          <h2 className="adm-panel-title">Recent signups</h2>
          {recent.length === 0 ? (
            <p className="adm-empty">No users yet.</p>
          ) : (
            <table className="adm-table">
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
                    <td className="adm-mono">{u.email}</td>
                    <td>
                      {u.country
                        ? `${u.city ? u.city + ", " : ""}${u.country}`
                        : "—"}
                    </td>
                    <td className="adm-mono">{formatDate(u.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="adm-panel">
          <h2 className="adm-panel-title">Top users by time spent</h2>
          {top.length === 0 ? (
            <p className="adm-empty">No usage data yet.</p>
          ) : (
            <table className="adm-table">
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
                    <td className="adm-mono">{u.email}</td>
                    <td>{formatDuration(u.total_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <div className="adm-row">
        <section className="adm-panel">
          <h2 className="adm-panel-title">Documents uploaded — top 10 users</h2>
          <BarChart
            data={docsByUser}
            xLabel="User"
            yLabel="Documents"
            height={260}
          />
        </section>
        <section className="adm-panel">
          <h2 className="adm-panel-title">Document type mix</h2>
          <PieChart data={docTypePie} size={220} />
        </section>
      </div>

      <div className="adm-row">
        <section className="adm-panel">
          <h2 className="adm-panel-title">
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
        <section className="adm-panel">
          <h2 className="adm-panel-title">
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

      <div className="adm-row">
        <section className="adm-panel adm-panel--wide">
          <h2 className="adm-panel-title">
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

      <section className="adm-panel adm-users-panel">
        <div className="adm-users-panel-header">
          <h2 className="adm-panel-title">Every user — full details</h2>
          <span className="adm-users-count">{users.length} total</span>
        </div>
        {users.length === 0 ? (
          <p className="adm-empty">No users yet.</p>
        ) : (
          <div className="adm-users-scroll">
            <table className="adm-table adm-table--users">
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
                        <td className="adm-mono">{u.email}</td>
                        <td className="adm-mono">{u.phone || "—"}</td>
                        <td>
                          {u.country ? (
                            <>
                              <span className="adm-flag">
                                {flagFromCode(u.country_code) || "🌐"}
                              </span>{" "}
                              {u.city ? `${u.city}, ` : ""}
                              {u.country}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="adm-mono">{formatDate(u.created_at)}</td>
                        <td>
                          {u.days_as_user != null
                            ? `${u.days_as_user}d`
                            : "—"}
                        </td>
                        <td>{formatDuration(u.total_seconds)}</td>
                        <td>{u.chat_sessions}</td>
                        <td>{u.chat_messages}</td>
                        <td>
                          <span className="adm-doc-pill">
                            {u.document_count}
                          </span>
                          {u.total_document_kb > 0 && (
                            <span className="adm-doc-size">
                              · {formatKb(u.total_document_kb)}
                            </span>
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="adm-btn adm-btn--ghost adm-btn--xs"
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
                        <tr className="adm-doc-row">
                          <td colSpan={12}>
                            <table className="adm-table adm-table--inner">
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
                                    <td className="adm-mono">
                                      {d.original_filename || d.filename}
                                    </td>
                                    <td>{d.doc_type || "—"}</td>
                                    <td>{d.total_chunks}</td>
                                    <td>{formatKb(d.file_size_kb)}</td>
                                    <td className="adm-mono">
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

const Card = ({ label, value, accent, icon: Icon }) => (
  <div className={`adm-card adm-card--${accent || "blue"}`}>
    {Icon && (
      <span className="adm-card-icon" aria-hidden="true">
        <Icon strokeWidth={2.2} />
      </span>
    )}
    <span className="adm-card-text">
      <span className="adm-card-label">{label}</span>
      <span className="adm-card-value">{value}</span>
    </span>
  </div>
);

const shortDay = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export default AdminDashboard;
