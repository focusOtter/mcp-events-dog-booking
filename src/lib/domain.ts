import { z } from 'zod';

export const services = ['Bath & brush', 'Full groom', 'Puppy pamper'] as const;
export const bookingSchema = z.object({
  dogName: z.string().trim().min(1).max(80),
  ownerName: z.string().trim().min(1).max(100),
  service: z.enum(services),
  startsAt: z.iso.datetime({ offset: true }).refine(value => Date.parse(value) > Date.now(), 'Choose a future appointment'),
}).strict();
export const filterSchema = z.object({ service: z.enum(services).optional() }).strict();
export const cancelSchema = z.object({ id: z.uuid() }).strict();
export type Booking = z.infer<typeof bookingSchema>;
export type Appointment = Booking & { id: string; status: 'booked' | 'cancelled' };
export type EventName = 'appointment.booked' | 'appointment.cancelled';
export type GroomingEvent = { eventId: string; name: EventName; timestamp: string; data: Appointment; cursor: string };

export const appointmentJsonSchema = {
  type: 'object', properties: {
    id: { type: 'string', format: 'uuid' }, dogName: { type: 'string' },
    ownerName: { type: 'string' }, service: { type: 'string', enum: services },
    startsAt: { type: 'string', format: 'date-time' }, status: { type: 'string', enum: ['booked', 'cancelled'] },
  }, required: ['id', 'dogName', 'ownerName', 'service', 'startsAt', 'status'], additionalProperties: false,
};
export const eventDefinitions = (['appointment.booked', 'appointment.cancelled'] as const).map(name => ({
  name, description: name === 'appointment.booked' ? 'A grooming appointment was booked.' : 'A grooming appointment was cancelled.',
  delivery: ['webhook'], inputSchema: z.toJSONSchema(filterSchema), payloadSchema: appointmentJsonSchema,
}));
