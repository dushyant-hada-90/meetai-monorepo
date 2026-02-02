'use server'
import { db } from '@/db';
import { meetingInvites, meetings, type ParticipantRole } from '@/db/schema';
import { eq, and, gt } from 'drizzle-orm';
import { addDays } from 'date-fns';

export async function getMeetingInviteLink(meetingId: string, role: ParticipantRole) {
  
  // 1. Fetch Meeting Details to get the correct 'startsAt' time
  const result = await db
    .select({ startsAt: meetings.startsAt })
    .from(meetings)
    .where(eq(meetings.id, meetingId))
    .limit(1);

  const meeting = result[0];

  if (!meeting) {
    throw new Error("Meeting not found");
  }

  // Logic: If meeting has a scheduled start time, expire then.
  // Fallback: If no time set, default to 7 days from now.
  const expiryDate = meeting.startsAt ? meeting.startsAt : addDays(new Date(), 7);

  // 2. Try to find an EXISTING, valid invite
  const existingInviteResult = await db
    .select()
    .from(meetingInvites)
    .where(
      and(
        eq(meetingInvites.meetingId, meetingId),
        eq(meetingInvites.role, role),
        gt(meetingInvites.expiresAt, new Date()) // Must be in the future
      )
    )
    .limit(1);

  const existingInvite = existingInviteResult[0];

  if (existingInvite) {
    return `${process.env.NEXT_PUBLIC_APP_URL}/meetings/invite?token=${existingInvite.id}`;
  }

  // 3. If none exists, create a NEW one
  // Note: .returning() is crucial in Drizzle to get back the ID of the inserted row
  const [newInvite] = await db.insert(meetingInvites)
    .values({
      meetingId,
      role, 
      expiresAt: expiryDate
    })
    .returning();

  // 4. Return the URL
  return `${process.env.NEXT_PUBLIC_APP_URL}/meetings/invite?token=${newInvite.id}`;
}