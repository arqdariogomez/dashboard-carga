/**
 * Sistema de gestión de sincronización para evitar conflictos entre zoom y sincronización automática
 * 
 * Problema: El zoom en WorkloadLineChart causa resets cada ~10s debido al sistema de sincronización
 * Solución: Implementar un sistema de tickets que aísla las operaciones de zoom de la sincronización
 */

interface SyncTicket {
  id: string;
  type: 'zoom' | 'filter' | 'project-edit' | 'manual';
  createdAt: number;
  expiresAt: number;
  description: string;
}

interface SyncState {
  currentTicket: SyncTicket | null;
  isSyncLocked: boolean;
  lastSyncAt: number;
}

class SyncManager {
  private static instance: SyncManager;
  private state: SyncState = {
    currentTicket: null,
    isSyncLocked: false,
    lastSyncAt: 0,
  };

  static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  /**
   * Crear un ticket para aislar una operación de la sincronización automática
   */
  createTicket(type: SyncTicket['type'], description: string, durationMs: number = 5000): SyncTicket {
    const ticket: SyncTicket = {
      id: `ticket-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      createdAt: Date.now(),
      expiresAt: Date.now() + durationMs,
      description,
    };

    this.state.currentTicket = ticket;
    this.state.isSyncLocked = true;

    console.log(`🎫 SyncManager: Ticket creado [${type}] ${description}`, ticket);

    return ticket;
  }

  /**
   * Liberar un ticket activo
   */
  releaseTicket(ticketId: string): boolean {
    if (!this.state.currentTicket || this.state.currentTicket.id !== ticketId) {
      console.warn(`🎫 SyncManager: Intento de liberar ticket inválido ${ticketId}`);
      return false;
    }

    console.log(`🎫 SyncManager: Ticket liberado [${this.state.currentTicket.type}] ${this.state.currentTicket.description}`);
    
    this.state.currentTicket = null;
    this.state.isSyncLocked = false;
    this.state.lastSyncAt = Date.now();

    return true;
  }

  /**
   * Verificar si hay un ticket activo y si ha expirado
   */
  checkTicketExpiration(): void {
    if (!this.state.currentTicket) return;

    if (Date.now() > this.state.currentTicket.expiresAt) {
      console.log(`🎫 SyncManager: Ticket expirado [${this.state.currentTicket.type}]`);
      this.releaseTicket(this.state.currentTicket.id);
    }
  }

  /**
   * Verificar si la sincronización está bloqueada
   */
  isLocked(): boolean {
    this.checkTicketExpiration();
    return this.state.isSyncLocked;
  }

  /**
   * Obtener información del ticket actual
   */
  getCurrentTicket(): SyncTicket | null {
    this.checkTicketExpiration();
    return this.state.currentTicket;
  }

  /**
   * Forzar liberación de todos los tickets (emergency)
   */
  forceReleaseAll(): void {
    if (this.state.currentTicket) {
      console.log(`🎫 SyncManager: Forzando liberación de ticket [${this.state.currentTicket.type}]`);
    }
    this.state.currentTicket = null;
    this.state.isSyncLocked = false;
    this.state.lastSyncAt = Date.now();
  }

  /**
   * Obtener estado completo para debugging
   */
  getState(): SyncState {
    this.checkTicketExpiration();
    return { ...this.state };
  }
}

export default SyncManager;
export type { SyncTicket, SyncState };
