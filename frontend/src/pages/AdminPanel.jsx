import { useState, useEffect } from 'react';

export default function AdminPanel() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/users', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setUsers(Array.isArray(data) ? data : []); setLoading(false); });
  }, []);

  const update = async (id, body) => {
    const res = await fetch(`/api/users/${id}`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === id ? { ...u, ...body } : u));
    }
  };

  const approve = async (id, approved) => {
    const res = await fetch(`/api/users/${id}/approve`, {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approved })
    });
    if (res.ok) {
      setUsers(prev => prev.map(u => u.id === id ? { ...u, approved } : u));
    }
  };

  const deleteUser = async (id) => {
    if (!confirm('¿Eliminar usuario?')) return;
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE', credentials: 'include' });
    if (res.ok) setUsers(prev => prev.filter(u => u.id !== id));
  };

  if (loading) return <div className="loading">Cargando...</div>;

  const pending = users.filter(u => !u.approved);
  const approved = users.filter(u => u.approved);

  return (
    <div>
      <h1 style={{ marginBottom: '1.5rem' }}>Panel de Administración</h1>

      {pending.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <h2 className="admin-section-title">Pendientes de aprobación</h2>
          <div className="users-table">
            {pending.map(u => (
              <div key={u.id} className="user-row">
                {u.avatar && <img src={u.avatar} alt="" className="user-avatar-sm" referrerPolicy="no-referrer" />}
                <div className="user-info">
                  <span className="user-row-name">{u.name}</span>
                  <span className="user-row-email">{u.email}</span>
                </div>
                <span className="badge badge-pending">Pendiente</span>
                <div className="user-row-actions">
                  <button className="btn btn-sm btn-success" onClick={() => approve(u.id, 1)}>✓ Aprobar</button>
                  <button className="btn btn-sm btn-danger" onClick={() => deleteUser(u.id)}>🗑️</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="admin-section-title">Usuarios aprobados</h2>
        <div className="users-table">
          {approved.map(u => (
            <div key={u.id} className="user-row">
              {u.avatar && <img src={u.avatar} alt="" className="user-avatar-sm" referrerPolicy="no-referrer" />}
              <div className="user-info">
                <span className="user-row-name">{u.name}</span>
                <span className="user-row-email">{u.email}</span>
              </div>
              <span className={`badge ${u.is_admin ? 'badge-admin' : 'badge-user'}`}>
                {u.is_admin ? 'Admin' : 'Usuario'}
              </span>
              <div className="user-row-actions">
                <button
                  className="btn btn-sm"
                  onClick={() => update(u.id, { is_admin: u.is_admin ? 0 : 1 })}
                >
                  {u.is_admin ? '↓ Quitar admin' : '↑ Hacer admin'}
                </button>
                <button className="btn btn-sm btn-danger" onClick={() => approve(u.id, 0)}>Revocar</button>
                <button className="btn btn-sm btn-danger" onClick={() => deleteUser(u.id)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
