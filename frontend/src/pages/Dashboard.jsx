import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s > 0 ? s + 's' : ''}`.trim();
  return `${s}s`;
}

function totalDuration(timers) {
  return timers.reduce((acc, t) => acc + t.duration_seconds, 0);
}

export default function Dashboard() {
  const { user } = useAuth();
  const [boards, setBoards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const url = user ? '/api/boards' : '/api/boards/public';
    fetch(url, { credentials: 'include' })
      .then(res => res.json())
      .then(data => { setBoards(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => { setError('Error cargando boards'); setLoading(false); });
  }, [user]);

  const deleteBoard = async (id) => {
    if (!confirm('¿Eliminar este board?')) return;
    await fetch(`/api/boards/${id}`, { method: 'DELETE', credentials: 'include' });
    setBoards(prev => prev.filter(b => b.id !== id));
  };

  if (loading) return <div className="loading">Cargando...</div>;

  return (
    <div>
      <div className="dashboard-header">
        <h1>{user ? 'Mis Boards' : 'Boards'}</h1>
        {user && <Link to="/board/new" className="btn btn-primary">+ Nuevo Board</Link>}
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {boards.length === 0 ? (
        <div className="empty-state">
          <p>{user ? 'No tienes ningún board aún.' : 'No hay boards disponibles.'}</p>
          {user && <Link to="/board/new" className="btn btn-primary" style={{ marginTop: '1rem' }}>Crear el primero</Link>}
        </div>
      ) : (
        <div className="boards-grid">
          {[...boards].sort((a, b) => (b.running ? 1 : 0) - (a.running ? 1 : 0)).map(board => (
            <div key={board.id} className="board-card">
              <h3>{board.name}</h3>
              <div className="board-meta">
                <span className="board-id">{board.timers.length} temporizador{board.timers.length !== 1 ? 'es' : ''}</span>
                {board.timers.length > 0 && (
                  <span className="board-id">· {formatDuration(totalDuration(board.timers))} total</span>
                )}
              </div>
              <div className="board-actions">
                <Link to={`/b/${board.access_token}`} className="btn btn-sm btn-primary">▶ Ver</Link>
                {user && <Link to={`/board/${board.id}/edit`} className="btn btn-sm">✏️ Editar</Link>}
                {user && <button onClick={() => deleteBoard(board.id)} className="btn btn-sm btn-danger">🗑️</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
