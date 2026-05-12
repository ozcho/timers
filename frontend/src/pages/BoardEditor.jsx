import { useState, useEffect } from 'react';
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

function TimerRow({ timer, index, total, onChange, onRemove, onMove }) {
  const { h, m, s } = formatDurationInput(timer.duration_seconds);

  return (
    <div className="timer-row">
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
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isNew) {
      fetch(`/api/boards/${id}`, { credentials: 'include' })
        .then(res => res.json())
        .then(data => {
          setName(data.name || '');
          setTimers(data.timers || []);
          setLoading(false);
        })
        .catch(() => { setError('Error cargando board'); setLoading(false); });
    }
  }, [id, isNew]);

  const addTimer = () => {
    setTimers(prev => [...prev, { label: '', duration_seconds: 60, _key: Date.now() }]);
  };

  const updateTimer = (index, updated) => {
    setTimers(prev => prev.map((t, i) => i === index ? updated : t));
  };

  const removeTimer = (index) => {
    setTimers(prev => prev.filter((_, i) => i !== index));
  };

  const moveTimer = (index, dir) => {
    const newTimers = [...timers];
    const target = index + dir;
    if (target < 0 || target >= newTimers.length) return;
    [newTimers[index], newTimers[target]] = [newTimers[target], newTimers[index]];
    setTimers(newTimers);
  };

  const save = async () => {
    if (!name.trim()) { setError('El nombre es obligatorio'); return; }
    if (timers.some(t => t.duration_seconds < 1)) { setError('Cada temporizador debe tener al menos 1 segundo'); return; }
    setSaving(true);
    setError('');

    try {
      const method = isNew ? 'POST' : 'PUT';
      const url = isNew ? '/api/boards' : `/api/boards/${id}`;
      const res = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, timers })
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

        <div className="timers-editor-list">
          {timers.map((timer, index) => (
            <TimerRow
              key={timer.id || timer._key || index}
              timer={timer}
              index={index}
              total={timers.length}
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
