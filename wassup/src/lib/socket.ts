import { io } from 'socket.io-client';

  const SERVER_URL = 'http://192.168.1.70:3001';

  export const socket = io(SERVER_URL, {
    autoConnect: false,
  });