import { io, Socket } from 'socket.io-client';
import { TOKEN_KEY } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io('/', {
      auth: { token: localStorage.getItem(TOKEN_KEY) },
      transports: ['websocket', 'polling'],
    });
  }
  return socket;
}

export function resetSocket() {
  socket?.disconnect();
  socket = null;
}
