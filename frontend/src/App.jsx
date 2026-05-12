import { Routes, Route } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Login from './pages/Login';
import PendingApproval from './pages/PendingApproval';
import Dashboard from './pages/Dashboard';
import BoardView from './pages/BoardView';
import BoardEditor from './pages/BoardEditor';
import AdminPanel from './pages/AdminPanel';

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Cargando...</div>;
  }

  if (user && !user.approved) {
    return (
      <div className="app">
        <Navbar />
        <main className="main-content">
          <PendingApproval />
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <Navbar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/b/:token" element={<BoardView />} />
          <Route path="/board/:id/edit" element={user ? <BoardEditor /> : <Login />} />
          <Route path="/board/new" element={user ? <BoardEditor /> : <Login />} />
          <Route path="/admin" element={user?.is_admin ? <AdminPanel /> : <Login />} />
        </Routes>
      </main>
    </div>
  );
}
