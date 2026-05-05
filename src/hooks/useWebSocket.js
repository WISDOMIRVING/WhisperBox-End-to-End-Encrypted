import { useEffect, useRef, useState } from 'react';

export const useWebSocket = (token, onMessage, onUserStatus) => {
  const ws = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `ws://localhost:8000/ws?token=${token}`;

    const connect = () => {
      console.log("Connecting to WebSocket...");
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => {
        console.log("WebSocket connected");
        setConnected(true);
      };

      ws.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.event === 'message.receive') {
          onMessage(data);
        } else if (data.event === 'user.online' || data.event === 'user.offline') {
          onUserStatus(data);
        }
      };

      ws.current.onclose = () => {
        console.log("WebSocket disconnected. Retrying...");
        setConnected(false);
        setTimeout(connect, 3000);
      };

      ws.current.onerror = (err) => {
        console.error("WebSocket error:", err);
        ws.current.close();
      };
    };

    connect();

    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [token]);

  const sendMessage = (to, payload) => {
    if (ws.current && ws.current.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        event: 'message.send',
        to,
        payload
      }));
      return true;
    }
    return false;
  };

  return { connected, sendMessage };
};
