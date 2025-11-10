import { io } from 'socket.io-client';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
    this.isConnected = false;
  }

  connect() {
    if (this.socket?.connected) {
      return;
    }

    // Use the same origin as the current page (works with reverse proxies)
    const backendUrl = window.location.origin;
    this.socket = io(backendUrl, {
      transports: ['websocket', 'polling'],
    });

    this.socket.on('connect', () => {
      console.log('[WebSocket] Connected to server');
      this.isConnected = true;
      // Emit reconnect event if this is a reconnection
      if (this.wasConnected) {
        this.emit('reconnect');
      }
      this.wasConnected = true;
    });

    this.socket.on('disconnect', () => {
      console.log('[WebSocket] Disconnected from server');
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error) => {
      console.error('[WebSocket] Connection error:', error);
      this.isConnected = false;
    });

    // Set up default event listeners
    this.setupDefaultListeners();
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  setupDefaultListeners() {
    if (!this.socket) return;

    // Transfer events
    this.socket.on('transfer:update', (data) => {
      this.emit('transfer:update', data);
    });

    this.socket.on('transfer:progress', (data) => {
      this.emit('transfer:progress', data);
    });

    this.socket.on('transfer:complete', (data) => {
      this.emit('transfer:complete', data);
    });

    this.socket.on('transfer:error', (data) => {
      this.emit('transfer:error', data);
    });

    // Initial transfer list
    this.socket.on('transfers:initial', (data) => {
      this.emit('transfers:initial', data);
    });
  }

  // Event emitter pattern
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`[WebSocket] Error in ${event} callback:`, error);
        }
      });
    }
  }

  // Send events to server (if needed in future)
  send(event, data) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    } else {
      console.warn('[WebSocket] Cannot send event, not connected:', event);
    }
  }

  // Get connection status
  getStatus() {
    return {
      connected: this.isConnected,
      socketId: this.socket?.id || null,
    };
  }
}

// Export singleton instance
export default new WebSocketService();
