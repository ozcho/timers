import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function formatDurationInput(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return { h, m, s };
}

function toSeconds(h, m, s) {
  return (parseInt(h) || 0) * 3600 + (parseInt(m) || 0) * 60 + (parseInt(s) || 0);
}

let _keyCounter = 0;
function makeKey() { return `k_${Date.now()}_${++_keyCounter}`; }
function withKey(t) { return t._key ? t : { ...t, _key: makeKey() }; }

function TimerRow({ timer, index, total, selected, onToggleSelect, onChange, onRemove, onMove }) {
  const { h, m, s } = formatDurationInput(timer.duration_seconds);

  return (
    <div className={`timer-row${selected ? ' timer-row--selected' : ''}`}>
      <label className="timer-row-select" title="Seleccionar" onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={selected} onChange={onToggleSelect} />
      </label>
      <div className="timer-row-num">{index + 1}</div>
      <div className="timer-row-fields">
        <input
          className="input"
          placeholder="Nombre (ej: Trabajo)"
          value={timer.label}
          onChange={e => onChange({ ...timer, label: e.target.value })}
        />
        <div className="duration-inputs">
          <label>
            <span>h</span>
            <input
              type="number" min="0" max="23"
              className="input duration-input"
              value={h}
              onChange={e => onChange({ ...timer, duration_seconds: toSeconds(e.target.value, m, s) })}
            />
          </label>
          <label>
            <span>min</span>
            <input
              type="number" min="0" max="59"
              className="input duration-input"
              value={m}
              onChange={e => onChange({ ...timer, duration_seconds: toSeconds(h, e.target.value, s) })}
            />
          </label>
          <label>
            <span>seg</span>
            <input
              type="number" min="0" max="59"
              className="input duration-input"
              value={s}
              onChange={e => onChange({ ...timer, duration_seconds: toSeconds(h, m, e.target.value) })}
            />
          </label>
        </div>
      </div>
      <div className="timer-row-actions">
        <button className="btn btn-xs" onClick={() => onMove(index, -1)} disabled={index === 0} title="Subir">↑</button>
        <button className="btn btn-xs" onClick={() => onMove(index, 1)} disabled={index === total - 1} title="Bajar">↓</button>
        <button className="btn btn-xs btn-danger" onClick={() => onRemove(index)} title="Eliminar">✕</button>
      </div>
    </div>
  );
}

export default function BoardEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isNew = !id;

  const [name, setName] = useState('');
  const [timers, setTimers] = useState([]);
  const [selected, setSelected] = useState(new Set()); // Set of _key strings
  const [clipboard, setClipboard] = useState([]); // [{ label, duration_seconds }]
  const [pasteCount, setPasteCount] = useState(1);
  const [controlPassword, setControlPassword] = useState('');
  const [removePassword, setRemovePassword] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isNew) {
      fetch(`/api/boards/${id}`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          setName(data.name || '');
          setTimers((data.timers || []).map(withKey));
          setHasPassword(!!data.has_control_password);
          setLoading(false);
        })
        .catch(() => { setError('Error cargando board'); setLoading(false); });
    }
  }, [id, isNew]);

  const addTimer = () => {
    setTimers(prev => [...prev, withKey({ label: '', duration_seconds: 60 })]);
  };

  const updateTimer = (index, updated) => {
    setTimers(prev => prev.map((t, i) => i === index ? updated : t));
  };

  const removeTimer = (index) => {
    const key = timers[index]?._key;
    setTimers(prev => prev.filter((_, i) => i !== index));
    if (key) setSelected(prev => { const s = new Set(prev); s.delete(key); return s; });
  };

  const moveTimer = (index, dir) => {
    const newTimers = [...timers];
    const target = index + dir;
    if (target < 0 || target >= newTimers.length) return;
    [newTimers[index], newTimers[target]] = [newTimers[target], newTimers[index]];
    setTimers(newTimers);
  };

  const toggleSelect = useCallback((key) => {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(key)) s.delete(key); else s.add(key);
      return s;
    });
  }, []);

  const selectAll = () => setSelected(new Set(timers.map(t => t._key)));
  const deselectAll = () => setSelected(new Set());

  const copySelected = useCallback(() => {
    const copies = timers
      .filter(t => selected.has(t._key))
      .map(({ label, duration_seconds }) => ({ label, duration_seconds }));
    if (copies.length) setClipboard(copies);
  }, [timers, selected]);

  const paste = useCallback(() => {
    if (!clipboard.length) return;
    const count = Math.max(1, Math.min(100, parseInt(pasteCount) || 1));
    const selectedIndices = timers.reduce((acc, t, i) => {
      if (selected.has(t._key)) acc.push(i);
      return acc;
    }, []);
    const insertAfter = selectedIndices.length ? Math.max(...selectedIndices) : timers.length - 1;
    const newTimers = [];
    for (let r = 0; r < count; r++) {
      clipboard.forEach(t => newTimers.push(withKey({ ...t })));
    }
    setTimers(prev => [
      ...prev.slice(0, insertAfter + 1),
      ...newTimers,
      ...prev.slice(insertAfter + 1),
    ]);
  }, [clipboard, pasteCount, timers, selected]);

  // Keyboard shortcuts Ctrl+C / Ctrl+V (only when no text input focused)
  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && selected.size > 0) {
        e.preventDefault();
        copySelected();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && clipboard.length > 0) {
        e.preventDefault();
        paste();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [copySelected, paste, selected.size, clipboard.length]);

  const save = async () => {
    if (!name.trim()) { setError('El nombre es obligatorio'); return; }
    if (timers.some(t => t.duration_seconds < 1)) { setError('Cada temporizador debe tener al menos 1 segundo'); return; }
    setSaving(true);
    setError('');

    try {
      const method = isNew ? 'POST' : 'PUT';
      const url = isNew ? '/api/boards' : `/api/boards/${id}`;
      const passwordPayload = isNew
        ? { control_password: controlPassword.trim() || '' }
        : removePassword
          ? { control_password: '' }
          : controlPassword.trim()
            ? { control_password: controlPassword.trim() }
            : {};
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, timers, ...passwordPayload })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error guardando');
      navigate('/');
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div className="editor-page">
      <div className="editor-header">
        <h1>{isNew ? 'Nuevo Board' : 'Editar Board'}</h1>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="form-group">
        <label>Nombre del board</label>
        <input
          className="input"
          placeholder="Ej: Pomodoro, Entrenamiento..."
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>

      <div className="form-group">
        <label>Contraseña de control {hasPassword && !isNew && <span style={{ fontWeight: 'normal', color: 'var(--text-muted, #888)' }}>(configurada)</span>}</label>
        {removePassword ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ color: 'var(--text-muted, #888)', fontSize: '0.9em' }}>Se eliminará al guardar</span>
            <button type="button" className="btn btn-sm" onClick={() => setRemovePassword(false)}>Cancelar</button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              className="input"
              type="password"
              placeholder={isNew ? 'Opcional — permite controlar sin ser admin' : hasPassword ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Opcional — permite controlar sin ser admin'}
              value={controlPassword}
              onChange={e => setControlPassword(e.target.value)}
              autoComplete="new-password"
            />
            {!isNew && hasPassword && (
              <button type="button" className="btn btn-sm btn-danger" onClick={() => { setControlPassword(''); setRemovePassword(true); }}>
                Quitar
              </button>
            )}
          </div>
        )}
      </div>

      <div className="timers-editor">
        <div className="timers-editor-header">
          <h2>Temporizadores</h2>
          <button className="btn btn-sm btn-primary" onClick={addTimer}>+ Agregar</button>
        </div>

        {timers.length === 0 && (
          <div className="empty-state" style={{ padding: '2rem' }}>
            <p>No hay temporizadores aún. ¡Agrega uno!</p>
          </div>
        )}

        {timers.length > 0 && (
          <div className="timers-selection-bar">
            <span className="timers-selection-info">
              {selected.size > 0
                ? `${selected.size} seleccionado${selected.size !== 1 ? 's' : ''}`
                : 'Selecciona para copiar'}
            </span>
            <button className="btn btn-xs" onClick={selectAll} disabled={selected.size === timers.length}>
              Sel. todo
            </button>
            {selected.size > 0 && (
              <button className="btn btn-xs" onClick={deselectAll}>Deseleccionar</button>
            )}
            {selected.size > 0 && (
              <button className="btn btn-xs btn-primary" onClick={copySelected} title="Ctrl+C">
                📋 Copiar ({selected.size})
              </button>
            )}
            {clipboard.length > 0 && (
              <div className="timers-paste-group">
                <span className="timers-selection-info">×</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={pasteCount}
                  onChange={e => setPasteCount(e.target.value)}
                  className="input duration-input"
                  style={{ width: '3.5rem' }}
                  title="Repeticiones al pegar"
                />
                <button
                  className="btn btn-xs btn-primary"
                  onClick={paste}
                  title={`Pegar ${clipboard.length} bloque${clipboard.length !== 1 ? 's' : ''} × ${pasteCount} (Ctrl+V)`}
                >
                  ⎘ Pegar
                </button>
              </div>
            )}
          </div>
        )}

        <div className="timers-editor-list">
          {timers.map((timer, index) => (
            <TimerRow
              key={timer.id || timer._key || index}
              timer={timer}
              index={index}
              total={timers.length}
              selected={selected.has(timer._key)}
              onToggleSelect={() => toggleSelect(timer._key)}
              onChange={updated => updateTimer(index, updated)}
              onRemove={() => removeTimer(index)}
              onMove={(i, dir) => moveTimer(i, dir)}
            />
          ))}
        </div>

        {timers.length > 0 && (
          <div className="timers-total">
            Total: {timers.reduce((acc, t) => acc + t.duration_seconds, 0)} segundos
            ({Math.floor(timers.reduce((acc, t) => acc + t.duration_seconds, 0) / 60)} min)
          </div>
        )}
      </div>

      <div className="form-actions">
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? 'Guardando...' : 'Guardar'}
        </button>
        <button className="btn" onClick={() => navigate(-1)}>Cancelar</button>
      </div>
    </div>
  );
}
