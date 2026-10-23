import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import accentureLogo from '../assets/accenture-logo.png';
import ScenarioLiveLogo from '../components/ScenarioLiveLogo';
import SpaceBackground from '../components/SpaceBackground';
import PreSessionForm from '../components/PreSessionForm';
import './Presenter.css';

type SessionStatus = 'IDLE' | 'ACTIVE' | 'ENDED';
type NfcStatus = 'waiting' | 'assigned' | 'error';
type Topic = 'sustainability' | 'operations' | 'innovation' | 'default';
type FeedEventType =
  | 'topic_switch'
  | 'osc_trigger'
  | 'sonos_scene'
  | 'nfc_assignment'
  | 'api_error'
  | 'session_start'
  | 'session_end'
  | 'info';

interface FeedEvent {
  id: string;
  timestamp: Date;
  type: FeedEventType;
  message: string;
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatTimestamp(date: Date): string {
  return `${date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}`;
}

function formatElapsed(s: number): string {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function fmtEventTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

const TOPIC_LABELS: Record<Topic, string> = {
  sustainability: 'Sustainability',
  operations: 'Operations',
  innovation: 'Innovation',
  default: 'Default',
};

const SYSTEM_ITEMS = [
  { id: 'osc',   label: 'OSC Bridge'   },
  { id: 'sonos', label: 'Sonos API'    },
  { id: 'nfc',   label: 'NFC Reader'   },
  { id: 'api',   label: 'Backend API'  },
  { id: 'ai',    label: 'AI Engine'    },
];

export default function PresenterPage() {
  const navigate = useNavigate();

  // ── Auth ─────────────────────────────────────────────────────────────
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => sessionStorage.getItem('presenter-auth') === 'true',
  );

  // ── Session ──────────────────────────────────────────────────────────
  const [status, setStatus] = useState<SessionStatus>('IDLE');
  const [currentTopic, setCurrentTopic] = useState<Topic>('default');
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);

  // ── NFC ───────────────────────────────────────────────────────────────
  const [nfcStatus, setNfcStatus] = useState<NfcStatus | null>(null);
  const [nfcTagId, setNfcTagId] = useState('');

  // ── Modals ────────────────────────────────────────────────────────────
  const [showSystemCheck, setShowSystemCheck] = useState(false);

  const now = useClock();

  // ── Timer ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (status !== 'ACTIVE' || !sessionStartTime) {
      setElapsed(0);
      return;
    }
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - sessionStartTime.getTime()) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [status, sessionStartTime]);

  // ── Feed helper ───────────────────────────────────────────────────────
  const addEvent = useCallback((type: FeedEventType, message: string) => {
    setFeedEvents(prev => [
      { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, timestamp: new Date(), type, message },
      ...prev,
    ]);
  }, []);

  // ── Session actions ───────────────────────────────────────────────────
  const startSession = useCallback(() => {
    const sid = `USR-${String(Math.floor(100000 + Math.random() * 900000)).slice(0, 6)}`;
    setCurrentSessionId(sid);
    setSessionStartTime(new Date());
    setStatus('ACTIVE');
    setCurrentTopic('default');
    addEvent('session_start', `Session ${sid} started`);
  }, [addEvent]);

  const endSession = useCallback(() => {
    setStatus('ENDED');
    setNfcStatus('waiting');
    setNfcTagId('');
    addEvent('session_end', 'Session ended — awaiting NFC keychain assignment');
  }, [addEvent]);

  // Called by HID reader on successful tap. Also used to simulate.
  const assignKeychain = useCallback((tagId: string, sessionId: string) => {
    setNfcTagId(tagId);
    setNfcStatus('assigned');
    addEvent('nfc_assignment', `Keychain assigned · tag ${tagId} → session ${sessionId}`);
  }, [addEvent]);

  const triggerNfcError = useCallback(() => {
    setNfcStatus('error');
    addEvent('api_error', 'NFC assignment failed — reader error');
  }, [addEvent]);

  const retryNfc = useCallback(() => {
    setNfcStatus('waiting');
    setNfcTagId('');
    addEvent('info', 'Retrying NFC assignment');
  }, [addEvent]);

  // Explicit cancel — only way to dismiss the modal besides successful assignment
  const cancelNfc = useCallback(() => {
    addEvent('info', 'NFC assignment cancelled by presenter');
    setStatus('IDLE');
    setNfcStatus(null);
    setNfcTagId('');
    setCurrentSessionId(null);
    setSessionStartTime(null);
    setCurrentTopic('default');
  }, [addEvent]);

  const completeSession = useCallback(() => {
    addEvent('info', 'Session complete — keychain assigned, view reset to IDLE');
    setStatus('IDLE');
    setNfcStatus(null);
    setNfcTagId('');
    setCurrentSessionId(null);
    setSessionStartTime(null);
    setCurrentTopic('default');
  }, [addEvent]);

  // ── Keyboard shortcuts — ⌘S / ⌘E only; NFC modal cannot be dismissed by Escape ──
  useEffect(() => {
    if (!isAuthenticated) return;
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      if (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 's' && status === 'IDLE') {
        e.preventDefault();
        startSession();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'e' && status === 'ACTIVE') {
        e.preventDefault();
        endSession();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAuthenticated, status, startSession, endSession]);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/signin', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  const handleLogout = () => {
    sessionStorage.removeItem('presenter-auth');
    setIsAuthenticated(false);
    navigate('/signin', { replace: true });
  };

  if (!isAuthenticated) {
    return null;
  }

  // ── Derive header status display ──────────────────────────────────────
  const statusClass = (() => {
    if (status === 'ENDED') {
      if (nfcStatus === 'assigned') return 'assigned';
      return 'nfc-waiting';
    }
    return status.toLowerCase();
  })();

  const statusLabel = (() => {
    if (status === 'ENDED') {
      if (nfcStatus === 'assigned') return 'ASSIGNED';
      return 'NFC WAITING';
    }
    return status;
  })();

  // ── Presenter view ────────────────────────────────────────────────────
  return (
    <div className="presenter">
      <SpaceBackground />

      {/* System Check Modal — dismissible by outside click */}
      {showSystemCheck && (
        <div className="presenter-modal-overlay" onClick={() => setShowSystemCheck(false)}>
          <div className="presenter-modal" onClick={e => e.stopPropagation()}>
            <div className="presenter-modal-hd">
              <h2 className="presenter-modal-title">Pre-Demo System Check</h2>
              <button className="presenter-modal-close" onClick={() => setShowSystemCheck(false)}>✕</button>
            </div>
            <ul className="presenter-syscheck-list">
              {SYSTEM_ITEMS.map(item => (
                <li key={item.id} className="presenter-syscheck-item">
                  <span className="presenter-syscheck-label">{item.label}</span>
                  <span className="presenter-syscheck-ok">
                    <span className="presenter-syscheck-dot" />
                    OK
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* NFC Assignment Modal — cannot be dismissed by outside click or Escape */}
      {status === 'ENDED' && nfcStatus !== null && (
        <div className="presenter-nfc-modal-overlay">
          <div className="presenter-nfc-modal">
            <div className="presenter-nfc-modal-hd">
              <h2 className="presenter-nfc-modal-title">NFC Keychain Assignment</h2>
              {currentSessionId && (
                <span className="presenter-nfc-modal-session">Session {currentSessionId}</span>
              )}
            </div>

            {nfcStatus === 'waiting' && (
              <>
                <div className="presenter-nfc-ring presenter-nfc-ring--lg">
                  <span className="presenter-nfc-ring-pulse" />
                  <span className="presenter-nfc-ring-label">NFC</span>
                </div>
                <p className="presenter-nfc-waiting-label">Waiting for keychain tap…</p>
                <p className="presenter-nfc-waiting-sub">Hand the client their purple keychain and ask them to tap</p>
                <div className="presenter-nfc-modal-actions">
                  <button
                    className="presenter-btn presenter-btn--confirm"
                    onClick={() => assignKeychain(
                      `NFC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
                      currentSessionId ?? 'USR-000000',
                    )}
                  >
                    Simulate Tap ✓
                  </button>
                  <button className="presenter-btn presenter-btn--outline" onClick={triggerNfcError}>
                    Simulate Error
                  </button>
                  <button className="presenter-btn presenter-btn--cancel" onClick={cancelNfc}>
                    Cancel
                  </button>
                </div>
              </>
            )}

            {nfcStatus === 'assigned' && (
              <>
                <div className="presenter-nfc-assigned-icon">✓</div>
                <p className="presenter-nfc-waiting-label">Keychain assigned ✓</p>
                <p className="presenter-nfc-tagid">{nfcTagId}</p>
                <button className="presenter-btn presenter-btn--start" onClick={completeSession}>
                  Done
                </button>
              </>
            )}

            {nfcStatus === 'error' && (
              <>
                <div className="presenter-nfc-error-icon">✕</div>
                <p className="presenter-nfc-waiting-label">Assignment failed — try again</p>
                <div className="presenter-nfc-modal-actions">
                  <button className="presenter-btn presenter-btn--confirm" onClick={retryNfc}>
                    Retry
                  </button>
                  <button className="presenter-btn presenter-btn--cancel" onClick={cancelNfc}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Top bar */}
      <header className="presenter-topbar">
        <div className="presenter-topbar-left">
          <img src={accentureLogo} alt="Accenture" className="presenter-logo" />
        </div>

        <Link to="/" className="presenter-wordmark">
          <ScenarioLiveLogo width={230} />
        </Link>

        <div className="presenter-topbar-right">
          {status === 'ACTIVE' && (
            <span className="presenter-timer">{formatElapsed(elapsed)}</span>
          )}
          {status === 'ACTIVE' && (
            <span className={`presenter-topic-badge presenter-topic-badge--${currentTopic}`}>
              {TOPIC_LABELS[currentTopic]}
            </span>
          )}
          <span className={`presenter-status presenter-status--${statusClass}`}>
            <span className="presenter-status-dot" />
            {statusLabel}
          </span>
          <button
            className="presenter-hdr-btn"
            onClick={() => setShowSystemCheck(true)}
            title="Pre-Demo System Check"
          >
            System Check
          </button>
          <span className="presenter-clock">{formatTimestamp(now)}</span>
          <button className="presenter-hdr-btn presenter-hdr-btn--ghost" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="presenter-content">
        <main className="presenter-body">

          {/* Session Controls */}
          <section className="presenter-panel presenter-panel--controls">
            <h2 className="presenter-panel-title">Session Controls</h2>
            <div className="presenter-controls-body">

              {status === 'IDLE' && (
                <div className="presenter-controls-state">
                  <p className="presenter-controls-hint">No active session.</p>
                  <button className="presenter-btn presenter-btn--start" onClick={startSession}>
                    Start Session
                  </button>
                  <div className="presenter-shortcuts">
                    <span className="presenter-shortcut">
                      <kbd className="presenter-kbd">⌘S</kbd>
                      <span className="presenter-shortcut-label">Start session</span>
                    </span>
                  </div>
                </div>
              )}

              {status === 'ACTIVE' && (
                <div className="presenter-controls-state">
                  <div className="presenter-active-info">
                    <span className="presenter-active-label">Session active</span>
                    <span className="presenter-active-timer">{formatElapsed(elapsed)}</span>
                  </div>
                  <div className="presenter-topic-section">
                    <span className="presenter-topic-section-label">Active scene</span>
                    <div className="presenter-topic-grid">
                      {(['sustainability', 'operations', 'innovation', 'default'] as Topic[]).map(t => (
                        <button
                          key={t}
                          className={`presenter-topic-btn presenter-topic-btn--${t}${currentTopic === t ? ' presenter-topic-btn--active' : ''}`}
                          onClick={() => {
                            if (currentTopic !== t) {
                              setCurrentTopic(t);
                              addEvent('topic_switch', `Scene → ${TOPIC_LABELS[t]}`);
                            }
                          }}
                        >
                          {TOPIC_LABELS[t]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button className="presenter-btn presenter-btn--end" onClick={endSession}>
                    End Session
                  </button>
                  <div className="presenter-shortcuts">
                    <span className="presenter-shortcut">
                      <kbd className="presenter-kbd">⌘E</kbd>
                      <span className="presenter-shortcut-label">End session</span>
                    </span>
                  </div>
                </div>
              )}

              {status === 'ENDED' && (
                <div className="presenter-controls-state presenter-controls-ended">
                  <div className="presenter-ended-info">
                    <span className="presenter-ended-label">Session ended</span>
                  </div>
                  <p className="presenter-controls-hint">NFC keychain assignment in progress…</p>
                </div>
              )}

            </div>
          </section>

          {/* Live Status Feed */}
          <section className="presenter-panel presenter-panel--feed">
            <h2 className="presenter-panel-title">Live Status Feed</h2>
            {feedEvents.length === 0 ? (
              <div className="presenter-feed-empty">
                <span className="presenter-feed-empty-icon">◉</span>
                <span className="presenter-feed-empty-label">No events yet</span>
                <span className="presenter-feed-empty-note">Events appear here in real time</span>
              </div>
            ) : (
              <ul className="presenter-feed-list">
                {feedEvents.map(evt => (
                  <li
                    key={evt.id}
                    className={`presenter-feed-item presenter-feed-item--${evt.type.replace(/_/g, '-')}`}
                  >
                    <span className="presenter-feed-time">{fmtEventTime(evt.timestamp)}</span>
                    <span className="presenter-feed-dot" />
                    <span className="presenter-feed-msg">{evt.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

        </main>

        {/* Right rail — Pre-Session Brief + Previous Conversations */}
        <div className="presenter-sidebar-col">
          <section className="presenter-panel">
            <h2 className="presenter-panel-title">Pre-Session Brief</h2>
            <div className="presenter-brief-body">
              <PreSessionForm />
            </div>
          </section>

          <aside className="presenter-panel">
            <h2 className="presenter-panel-title">Previous Conversations</h2>
            <div className="presenter-feed-empty">
              <span className="presenter-feed-empty-icon">◉</span>
              <span className="presenter-feed-empty-label">No conversations yet</span>
              <span className="presenter-feed-empty-note">Completed sessions will appear here</span>
            </div>
          </aside>
        </div>
      </div>

    </div>
  );
}
