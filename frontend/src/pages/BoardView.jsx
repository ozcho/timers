import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import QRCode from 'react-qr-code';
import { socket } from '../socket';
import { playCountdownBeep, playTransitionBeep, playAlarm } from '../utils/sounds';

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

function formatDurationLabel(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

// Compute remaining seconds for the current timer
function computeRemaining(board) {
  if (!board.running) return board.timers[board.current_index]?.duration_seconds ?? 0;
  if (board.paused) return board.paused_remaining;
  const duration = board.timers[board.current_index]?.duration_seconds ?? 0;
  const elapsed = (Date.now() - new Date(board.started_at).getTime()) / 1000;
  return Math.max(0, duration - elapsed);
}

// Compute total elapsed seconds across all completed + current timer
function computeGlobalElapsed(board) {
  const { timers, current_index } = board;
  if (!timers.length) return 0;
  const completedSeconds = timers.slice(0, current_index).reduce((acc, t) => acc + t.duration_seconds, 0);
  const currentDuration = timers[current_index]?.duration_seconds ?? 0;
  const currentRemaining = computeRemaining(board);
  const currentElapsed = currentDuration - currentRemaining;
  return completedSeconds + currentElapsed;
}

const SEGMENT_COLORS = [
  '#6366f1',
  '#22c55e',
  '#f59e0b',
  '#ec4899',
  '#06b6d4',
  '#f97316',
  '#a855f7',
  '#14b8a6',
  '#ef4444',
  '#84cc16',
];

export default function BoardView() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const [showQr, setShowQr] = useState(false);
  const [user, setUser] = useState(undefined);
  const [hasBoardControl, setHasBoardControl] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const finishedRef = useRef(false);
  const allDoneRef = useRef(false);
  const boardRef = useRef(null);
  const activeTimerRef = useRef(null);
  const countdownBeepedRef = useRef(new Set());
  const wakeLockRef = useRef(null);
  const wakeLockWanted = useRef(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLockSupported = 'wakeLock' in navigator;

  // Load auth user (optional)
  useEffect(() => {
    fetch('/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(u => setUser(u))
      .catch(() => setUser(null));
  }, []);

  // Load board by token
  useEffect(() => {
    fetch(`/api/boards/by-token/${token}`, { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setLoading(false); return; }
        setBoard(data);
        boardRef.current = data;
        setLoading(false);
      })
      .catch(() => { setError('Error cargando board'); setLoading(false); });
  }, [token]);

  // Socket connection
  useEffect(() => {
    if (!board) return;
    socket.connect();
    socket.emit('join-board', { boardId: board.id });

    const onState = (data) => {
      setBoard(data);
      boardRef.current = data;
      finishedRef.current = false;
      countdownBeepedRef.current = new Set();
    };

    const onUpdated = (data) => {
      setBoard(data);
      boardRef.current = data;
      finishedRef.current = false;
      allDoneRef.current = false;
      countdownBeepedRef.current = new Set();
    };

    const onDeleted = () => {
      alert('Este board ha sido eliminado.');
      navigate('/');
    };

    socket.on('board-state', onState);
    socket.on('board-updated', onUpdated);
    socket.on('board-deleted', onDeleted);

    return () => {
      socket.off('board-state', onState);
      socket.off('board-updated', onUpdated);
      socket.off('board-deleted', onDeleted);
      socket.disconnect();
    };
  }, [board?.id]);

  // Tick every 100ms for smooth countdown
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 100);
    return () => clearInterval(interval);
  }, []);

  // Detect timer finish and emit event (only from first client, but server deduplicates)
  useEffect(() => {
    const b = boardRef.current;
    if (!b || !b.running || b.paused || finishedRef.current) return;
    const remaining = computeRemaining(b);

    // Countdown beeps: last 3 seconds (3, 2, 1)
    const secondsLeft = Math.ceil(remaining);
    if (secondsLeft <= 3 && secondsLeft >= 1 && remaining > 0) {
      if (!countdownBeepedRef.current.has(secondsLeft)) {
        countdownBeepedRef.current.add(secondsLeft);
        playCountdownBeep();
      }
    }

    if (remaining <= 0) {
      finishedRef.current = true;
      const isLast = b.current_index >= b.timers.length - 1;
      if (isLast && !allDoneRef.current) {
        allDoneRef.current = true;
        playAlarm();
      } else if (!isLast) {
        playTransitionBeep();
      }
      socket.emit('timer-finished', { boardId: b.id, timerIndex: b.current_index });
    }
  }, [tick]);

  const acquireWakeLock = async () => {
    try {
      wakeLockRef.current = await navigator.wakeLock.request('screen');
      setWakeLockActive(true);
      wakeLockRef.current.addEventListener('release', () => {
        wakeLockRef.current = null;
      });
    } catch {
      wakeLockWanted.current = false;
      setWakeLockActive(false);
    }
  };

  const toggleWakeLock = async () => {
    if (wakeLockWanted.current) {
      wakeLockWanted.current = false;
      setWakeLockActive(false);
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } else {
      wakeLockWanted.current = true;
      await acquireWakeLock();
    }
  };

  // Re-adquirir wake lock al volver a primer plano
  useEffect(() => {
    const onVisibility = async () => {
      if (document.visibilityState === 'visible' && wakeLockWanted.current && !wakeLockRef.current) {
        await acquireWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      wakeLockRef.current?.release();
    };
  }, []);

  // Scroll active timer into view when index changes
  useEffect(() => {
    if (activeTimerRef.current) {
      activeTimerRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [board?.current_index, board?.running]);

  const control = useCallback((action, index) => {
    if (!board) return;
    socket.emit('timer-control', { boardId: board.id, action, index });
  }, [board]);

  if (loading) return <div className="loading">Cargando...</div>;
  if (error) return <div className="error-page"><h2>{error}</h2></div>;
  if (!board) return null;

  const isOwnerOrAdmin = user && (user.is_admin || (board.owner_id === user.id));
  const canControl = isOwnerOrAdmin || hasBoardControl;
  const timers = board.timers || [];
  const totalDuration = timers.reduce((acc, t) => acc + t.duration_seconds, 0);
  const globalElapsed = computeGlobalElapsed(board);
  const globalProgress = totalDuration > 0 ? Math.min(100, (globalElapsed / totalDuration) * 100) : 0;
  const allDone = board.running === 0 && board.current_index === 0 && !board.started_at && timers.length > 0;

  const qrUrl = `${window.location.origin}/b/${board.access_token}`;

  return (
    <div className="board-view-page">
      {/* Header */}
      <div className="board-view-header">
        <div className="board-view-title">
          <h1>{board.name}</h1>
          {isOwnerOrAdmin && (
            <a href={`/board/${board.id}/edit`} className="btn btn-sm">✏️ Editar</a>
          )}
        </div>
        {!canControl && board.has_control_password && (
          <button className="btn btn-sm" onClick={() => { setShowPasswordModal(true); setPasswordInput(''); setPasswordError(''); }} title="Introducir contraseña de control">
            🔑 Controlar
          </button>
        )}
        <button className="btn btn-sm" onClick={() => setShowQr(true)} title="Ver QR">📱 QR</button>
        {wakeLockSupported && (
          <label className="wakelock-switch" title={wakeLockActive ? 'Pantalla siempre activa' : 'Pantalla puede bloquearse'}>
            <input type="checkbox" checked={wakeLockActive} onChange={toggleWakeLock} />
            <span className="wakelock-switch-track" />
            <span className="wakelock-switch-label">{wakeLockActive ? '🔆' : '🔅'}</span>
          </label>
        )}
      </div>

      {/* Overall progress */}
      {timers.length > 0 && (
        <div className="overall-progress-section">
          <div className="overall-progress-label">
            <span>Progreso total</span>
            <span>{Math.round(globalProgress)}% · {formatTime(globalElapsed)} / {formatTime(totalDuration)}</span>
          </div>
          <div className="progress-track segmented-track">
            {timers.map((timer, index) => {
              const isSegDone = board.running ? index < board.current_index : false;
              const isSegCurrent = !!board.running && board.current_index === index;
              const segRemaining = isSegCurrent ? computeRemaining(board) : (isSegDone ? 0 : timer.duration_seconds);
              const segProgress = isSegCurrent
                ? Math.min(100, ((timer.duration_seconds - segRemaining) / timer.duration_seconds) * 100)
                : (isSegDone ? 100 : 0);
              return (
                <div
                  key={timer.id}
                  className="segment-outer"
                  style={{ flex: timer.duration_seconds }}
                >
                  <div className="segment-bar">
                    <div
                      className="segment-fill"
                      style={{ width: `${segProgress}%`, backgroundColor: SEGMENT_COLORS[index % SEGMENT_COLORS.length] }}
                    />
                  </div>
                  <span className="segment-label">{timer.label || `T${index + 1}`}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Controls */}
      {canControl && timers.length > 0 && (
        <div className="timer-controls">
          {!board.running ? (
            <button className="btn btn-primary btn-control" onClick={() => control('play')}>▶ Play</button>
          ) : board.paused ? (
            <button className="btn btn-primary btn-control" onClick={() => control('play')}>▶ Reanudar</button>
          ) : (
            <button className="btn btn-control" onClick={() => control('pause')}>⏸ Pausar</button>
          )}
          {board.running && (
            <button className="btn btn-control" onClick={() => control('skip')}>⏭ Siguiente</button>
          )}
          <button className="btn btn-danger btn-control" onClick={() => control('reset')}>↺ Reset</button>
        </div>
      )}

      {/* Timers list */}
      {timers.length === 0 ? (
        <div className="empty-state">
          <p>Este board no tiene temporizadores aún.</p>
          {isOwnerOrAdmin && <a href={`/board/${board.id}/edit`} className="btn btn-primary" style={{ marginTop: '1rem' }}>Agregar temporizadores</a>}
        </div>
      ) : (
        <div className="timers-list">
          {timers.map((timer, index) => {
            const isCurrent = board.running && board.current_index === index;
            const isDone = board.running
              ? index < board.current_index
              : (allDone && index < timers.length); // all done = all grey? no, show all done

            const remaining = isCurrent ? computeRemaining(board) : (isDone ? 0 : timer.duration_seconds);
            const progress = isCurrent
              ? Math.min(100, ((timer.duration_seconds - remaining) / timer.duration_seconds) * 100)
              : (isDone ? 100 : 0);

            return (
              <div
                key={timer.id}
                ref={isCurrent ? activeTimerRef : null}
                className={`timer-item ${isCurrent ? 'timer-item-active' : ''} ${isDone ? 'timer-item-done' : ''}`}
              >
                <div className="timer-item-main">
                  <div className="timer-item-left">
                    <span className="timer-item-index">{index + 1}</span>
                    <div className="timer-item-info">
                      <span className="timer-item-label">{timer.label || `Temporizador ${index + 1}`}</span>
                      <span className="timer-item-duration">{formatDurationLabel(timer.duration_seconds)}</span>
                    </div>
                  </div>
                  <div className="timer-item-right">
                    {isCurrent && (
                      <span className="timer-item-remaining">{formatTime(remaining)}</span>
                    )}
                    {isDone && <span className="timer-item-check">✓</span>}
                    {canControl && !isCurrent && board.running && !isDone && (
                      <button
                        className="btn btn-xs"
                        onClick={() => control('goto', index)}
                        title="Ir a este temporizador"
                      >→</button>
                    )}
                  </div>
                </div>
                <div className="progress-track timer-track">
                  <div className="progress-fill timer-fill" style={{ width: `${progress}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Password control modal */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => setShowPasswordModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>🔑 Contraseña de control</h2>
            <p>Introduce la contraseña para tomar el control de este board.</p>
            <form onSubmit={async (e) => {
              e.preventDefault();
              setPasswordError('');
              setPasswordLoading(true);
              socket.emit('verify-board-password', { boardId: board.id, password: passwordInput }, (res) => {
                setPasswordLoading(false);
                if (res?.error) { setPasswordError(res.error); }
                else { setHasBoardControl(true); setShowPasswordModal(false); }
              });
            }}>
              <input
                className="input"
                type="password"
                placeholder="Contraseña"
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                autoFocus
              />
              {passwordError && <div className="alert alert-error" style={{ marginTop: '0.5rem' }}>{passwordError}</div>}
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button className="btn btn-primary" type="submit" disabled={passwordLoading || !passwordInput}>
                  {passwordLoading ? 'Verificando...' : 'Acceder'}
                </button>
                <button className="btn" type="button" onClick={() => setShowPasswordModal(false)}>Cancelar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {showQr && (
        <div className="modal-overlay" onClick={() => setShowQr(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Acceso al board</h2>
            <p>Comparte este QR para que otros puedan ver los temporizadores.</p>
            <div className="qr-wrapper">
              <QRCode value={qrUrl} size={200} />
            </div>
            <p className="qr-url">{qrUrl}</p>
            <button className="btn btn-primary" onClick={() => setShowQr(false)}>Cerrar</button>
          </div>
        </div>
      )}
    </div>
  );
}
