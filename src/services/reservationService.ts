// src/services/reservationService.ts
import { db } from '../db/localDb';
import type { Reservation, Client, KdsOrderTicket } from '../types';

/**
 * REGLA DE ORO DE CONCURRENCIA (Reservas)
 * Antes de registrar cualquier reserva en la tabla 'reservas', el servicio debe realizar la siguiente validación transaccional:
 * - Consulta: db.reservas.where('tableId').equals(targetTableId).and(r => r.date === targetDate && r.status === 'PENDING').toArray()
 * - Consulta paralela: db.kdsOrderTickets.where('tableId').equals(targetTableId).and(o => o.overallStatus !== 'CERRADA' && o.overallStatus !== 'CANCELADA').toArray()
 * Si alguno de los resultados es mayor a 0, lanza un Error: "Mesa no disponible por ocupación o reserva previa".
 */
export async function validateReservationAvailability(
  targetTableId: string,
  targetDate: string
): Promise<void> {
  const targetTableIdStr = String(targetTableId);

  // 1. Query pending reservations in 'reservas' table (using string tableId)
  const pendingReservations = await db.reservas
    .where('tableId')
    .equals(targetTableIdStr)
    .and(r => r.date === targetDate && r.status === 'PENDING')
    .toArray();

  // 2. Query active tickets in 'kdsOrderTickets' table (using the exact tableId string/number)
  const activeTickets = await db.kdsOrderTickets
    .where('tableId')
    .equals(targetTableIdStr as any)
    .and(o => o.overallStatus !== 'CERRADA' && o.overallStatus !== 'CANCELADA')
    .toArray();

  if (pendingReservations.length > 0 || activeTickets.length > 0) {
    throw new Error('Mesa no disponible por ocupación o reserva previa');
  }
}

/**
 * Saves a new reservation along with its client creation and scheduled reminders in a single Dexie transaction.
 */
export async function saveReservationWithValidation(
  reservationData: Omit<Reservation, 'id' | 'status' | 'createdAt'>,
  clientData?: Omit<Client, 'id' | 'createdAt'>
): Promise<Reservation> {
  return await db.transaction('rw', [db.clients, db.reservas, db.notifications, db.kdsOrderTickets], async () => {
    // 1. Validate concurrency rules first
    await validateReservationAvailability(
      reservationData.tableId,
      reservationData.date
    );

    // 2. Handle client creation if a new client is being registered
    let finalClientId = reservationData.clientId;
    if (!finalClientId && clientData && clientData.name.trim()) {
      finalClientId = `cli-${Date.now()}`;
      const newClient: Client = {
        ...clientData,
        id: finalClientId,
        createdAt: new Date().toISOString()
      };
      await db.clients.put(newClient);
    }

    // 3. Create reservation in 'reservas' table
    const reservationId = `res-${Date.now()}`;
    const newRes: Reservation = {
      ...reservationData,
      id: reservationId,
      clientId: finalClientId || `temp-${Date.now()}`,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    };

    await db.reservas.put(newRes);

    // 4. Program Notification triggers (24h and 1h before)
    const resDateTime = new Date(`${newRes.date}T${newRes.time}`);
    const time24h = new Date(resDateTime.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const time1h = new Date(resDateTime.getTime() - 1 * 60 * 60 * 1000).toISOString();

    await db.notifications.put({
      id: `notif-${reservationId}-24h`,
      type: 'RESERVATION_REMINDER',
      targetType: 'RESERVATION',
      targetId: reservationId,
      title: 'Recordatorio de Reserva (24h antes)',
      message: `La reserva de ${newRes.clientName} para la mesa ${newRes.tableId} es mañana a las ${newRes.time}.`,
      scheduledAt: time24h,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    });

    await db.notifications.put({
      id: `notif-${reservationId}-1h`,
      type: 'RESERVATION_REMINDER',
      targetType: 'RESERVATION',
      targetId: reservationId,
      title: 'Recordatorio de Reserva (1h antes)',
      message: `La reserva de ${newRes.clientName} para la mesa ${newRes.tableId} inicia en 1 hora a las ${newRes.time}.`,
      scheduledAt: time1h,
      status: 'PENDING',
      createdAt: new Date().toISOString()
    });

    return newRes;
  });
}

/**
 * Checks if the current time is close to the reservation time (between -30 mins and +120 mins).
 */
export function isCurrentTimeCloseToReservation(reservation: Reservation): boolean {
  const now = new Date();
  const resDateTime = new Date(`${reservation.date}T${reservation.time}`);
  const diffMs = now.getTime() - resDateTime.getTime();
  const diffMins = diffMs / 60000;

  return diffMins >= -30 && diffMins <= 120;
}

import { syncTicketToFirebase } from './firebaseSync';

/**
 * Validates date/time proximity and transactionally transitions a reservation to 'IN_SERVICE',
 * creating/updating the active comanda ticket in 'kdsOrderTickets' with active reservation tracking flags.
 */
export async function startReservationService(reservation: Reservation): Promise<void> {
  if (!isCurrentTimeCloseToReservation(reservation)) {
    throw new Error(
      `El servicio solo puede iniciarse desde 30 minutos antes hasta 2 horas después del horario reservado (Hora: ${reservation.time}).`
    );
  }

  let ticketToSync: any = null;

  await db.transaction('rw', [db.reservas, db.kdsOrderTickets], async () => {
    // 1. Transition reservation status to 'IN_SERVICE'
    await db.reservas.update(reservation.id, { status: 'IN_SERVICE' });

    // 2. Create or update comanda in 'kdsOrderTickets' using direct table ID string
    const existingTicket = await db.kdsOrderTickets
      .where('tableId')
      .equals(reservation.tableId)
      .filter(t => t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA')
      .first();

    if (!existingTicket) {
      const ticketId = `kds-${Date.now()}`;
      const newComandaTime = new Date().toISOString();
      ticketToSync = {
        id: ticketId,
        orderId: `ord-${Date.now()}`,
        tableId: reservation.tableId,
        orderType: 'DINE_IN',
        paxCount: reservation.pax,
        waiterId: "Alex M. (POS)",
        comandaTime: newComandaTime,
        timeLimitMinutes: 15,
        isRushHourOrder: false,
        items: [],
        overallStatus: 'ORDEN TOMADA',
        createdAt: newComandaTime,
        reserva_activa: true,
        reserva_id: reservation.id
      };
      await db.kdsOrderTickets.put(ticketToSync);
    } else {
      ticketToSync = {
        ...existingTicket,
        reserva_activa: true,
        reserva_id: reservation.id
      };
      await db.kdsOrderTickets.update(existingTicket.id, {
        reserva_activa: true,
        reserva_id: reservation.id
      });
    }
  });

  if (ticketToSync) {
    await syncTicketToFirebase(ticketToSync);
  }
}

/**
 * Handles cleaning up or finalising a reservation's state when leaving/cancelling a comanda.
 * If no items are in the ticket, reverts reservation to PENDING and deletes draft comanda from 'kdsOrderTickets'.
 * Otherwise, completes the reservation.
 */
export async function handleComandaClosure(tableId: number | string | null): Promise<void> {
  if (tableId === null) return;

  const ticket = await db.kdsOrderTickets
    .where('tableId')
    .equals(tableId as any)
    .filter(t => t.overallStatus !== 'CERRADA' && t.overallStatus !== 'CANCELADA')
    .first();

  if (ticket && ticket.reserva_activa && ticket.reserva_id) {
    const hasItems = ticket.items && ticket.items.length > 0;

    if (!hasItems) {
      // Revert reservation to PENDING in 'reservas'
      await db.reservas.update(ticket.reserva_id, { status: 'PENDING' });
      // Update draft comanda ticket to 'CERRADA' instead of deleting
      const updatedTicket: KdsOrderTicket = {
        ...ticket,
        overallStatus: 'CERRADA',
        cancelJustification: 'Liberada sin consumos',
        closedAt: new Date().toISOString()
      };
      await syncTicketToFirebase(updatedTicket);
      console.log(`[Service] Comanda abandoned. Reverted reservation ${ticket.reserva_id} and closed ticket ${ticket.id}`);
    } else {
      // Mark reservation as COMPLETED (Consumed) in 'reservas'
      await db.reservas.update(ticket.reserva_id, { status: 'COMPLETED' });
      // Release reservation active flag from comanda
      const updatedTicket = {
        ...ticket,
        reserva_activa: false,
        reserva_id: undefined
      };
      await syncTicketToFirebase(updatedTicket);
      console.log(`[Service] Comanda active with items. Completed reservation ${ticket.reserva_id}`);
    }
  } else {
    // If the comanda was paid/completed (no active ticket found),
    // find any IN_SERVICE reservation for this table and mark it COMPLETED.
    const inServiceReservations = await db.reservas
      .where('status')
      .equals('IN_SERVICE')
      .toArray();

    for (const r of inServiceReservations) {
      if (r.tableId === String(tableId)) {
        await db.reservas.update(r.id, { status: 'COMPLETED' });
        console.log(`[Service] Completed active reservation ${r.id} for table ${r.tableId} due to payment/closure`);
      }
    }
  }
}
