const db = require('./db');

function setupSocket(io, sessionMiddleware) {
  // Share session with socket.io
  io.use((socket, next) => {
    sessionMiddleware(socket.request, socket.request.res || {}, next);
  });

  io.on('connection', (socket) => {
    // Join board room
    socket.on('join-board', ({ boardId }) => {
      if (!boardId) return;
      socket.join(boardId);
    });

    // Helper: get authenticated user from socket session
    function getSocketUser(socket) {
      const userId = socket.request.session?.passport?.user;
      if (!userId) return null;
      return db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    }

    // Helper: check if user can control a board
    function canControl(board, user) {
      return user && (user.is_admin || board.owner_id === user.id);
    }

    // Broadcast current board state to everyone in the room
    function broadcastState(boardId) {
      const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId);
      if (!board) return;
      const timers = db.prepare('SELECT * FROM timers WHERE board_id = ? ORDER BY order_index ASC').all(boardId);
      io.to(boardId).emit('board-state', { ...board, timers });
    }

    // Timer control: play / pause / resume / reset / skip / goto
    socket.on('timer-control', ({ boardId, action, index }) => {
      const user = getSocketUser(socket);
      const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId);
      if (!board || !canControl(board, user)) return;

      const timers = db.prepare('SELECT * FROM timers WHERE board_id = ? ORDER BY order_index ASC').all(boardId);
      if (!timers.length) return;

      const now = new Date().toISOString();

      if (action === 'play') {
        // Start or resume from current index
        if (board.paused) {
          // Resume: compute adjusted started_at so remaining time is preserved
          const elapsed = timers[board.current_index].duration_seconds - board.paused_remaining;
          const adjustedStart = new Date(Date.now() - elapsed * 1000).toISOString();
          db.prepare(`
            UPDATE boards SET running=1, paused=0, paused_remaining=0, started_at=?
            WHERE id=?
          `).run(adjustedStart, boardId);
        } else if (!board.running) {
          db.prepare(`
            UPDATE boards SET running=1, current_index=0, started_at=?, paused=0, paused_remaining=0
            WHERE id=?
          `).run(now, boardId);
        }
      } else if (action === 'pause') {
        if (!board.running || board.paused) return;
        const elapsed = Math.floor((Date.now() - new Date(board.started_at).getTime()) / 1000);
        const currentTimer = timers[board.current_index];
        const remaining = Math.max(0, currentTimer.duration_seconds - elapsed);
        db.prepare(`
          UPDATE boards SET paused=1, paused_remaining=?
          WHERE id=?
        `).run(remaining, boardId);
      } else if (action === 'reset') {
        db.prepare(`
          UPDATE boards SET running=0, current_index=0, started_at=NULL, paused=0, paused_remaining=0
          WHERE id=?
        `).run(boardId);
      } else if (action === 'skip') {
        if (!board.running) return;
        const nextIndex = board.current_index + 1;
        if (nextIndex >= timers.length) {
          db.prepare(`
            UPDATE boards SET running=0, current_index=0, started_at=NULL, paused=0, paused_remaining=0
            WHERE id=?
          `).run(boardId);
        } else {
          db.prepare(`
            UPDATE boards SET current_index=?, started_at=?, paused=0, paused_remaining=0
            WHERE id=?
          `).run(nextIndex, now, boardId);
        }
      } else if (action === 'goto' && typeof index === 'number') {
        if (index < 0 || index >= timers.length) return;
        db.prepare(`
          UPDATE boards SET running=1, current_index=?, started_at=?, paused=0, paused_remaining=0
          WHERE id=?
        `).run(index, now, boardId);
      }

      broadcastState(boardId);
    });

    // Client reports that the current timer has finished → advance to next
    socket.on('timer-finished', ({ boardId, timerIndex }) => {
      const board = db.prepare('SELECT * FROM boards WHERE id = ?').get(boardId);
      if (!board || !board.running || board.paused) return;
      if (board.current_index !== timerIndex) return; // already advanced

      const timers = db.prepare('SELECT * FROM timers WHERE board_id = ? ORDER BY order_index ASC').all(boardId);
      const nextIndex = timerIndex + 1;
      const now = new Date().toISOString();

      if (nextIndex >= timers.length) {
        db.prepare(`
          UPDATE boards SET running=0, current_index=0, started_at=NULL, paused=0, paused_remaining=0
          WHERE id=?
        `).run(boardId);
      } else {
        db.prepare(`
          UPDATE boards SET current_index=?, started_at=?, paused=0, paused_remaining=0
          WHERE id=?
        `).run(nextIndex, now, boardId);
      }

      broadcastState(boardId);
    });

    socket.on('disconnect', () => {});
  });
}

module.exports = { setupSocket };
