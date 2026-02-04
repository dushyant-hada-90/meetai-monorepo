import { db } from "@/db"
import { agents, meetingInvites, meetingParticipants, meetings, TranscriptItem, user, ParticipantRole } from "@/db/schema"
import { createTRPCRouter, premiumProcedure, protectedProcedure } from "@/trpc/init"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { and, count, desc, eq, getTableColumns, ilike, inArray, sql } from "drizzle-orm"
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE } from "@/constants"
import { meetingsInsertSchema, meetingsUpdateSchema } from "../schemas"
import { MeetingStatus } from "../types"
import { generateLivekitToken } from "@/lib/stream-video"
import { generateObject } from "ai";
import { google } from "@ai-sdk/google";
export const meetingsRouter = createTRPCRouter({

    // ---------------------------------------------------------
    // 1. APPEND TRANSCRIPT
    // Appends a new line to the meeting transcript.
    // UPDATE: Now checks meetingParticipants table. 
    // Any valid participant (Host/Attendee) can append to the transcript.
    // ---------------------------------------------------------
    appendTranscript: protectedProcedure
        .input(z.object({
            meetingId: z.string(),
            line: z.object({
                role: z.enum(["human", "assistant"]),
                speaker: z.string(), // Accepts the ID
                text: z.string(),
                timestamp: z.number(),
            })
        }))
        .mutation(async ({ input, ctx }) => {
            // 1. SECURITY: First, verify the user is actually IN the meeting.
            // We use a simple select before the update to ensure permissions.
            const [participant] = await db
                .select()
                .from(meetingParticipants)
                .where(and(
                    eq(meetingParticipants.meetingId, input.meetingId),
                    eq(meetingParticipants.userId, ctx.auth.user.id)
                ));

            if (!participant) {
                // If they aren't in the participants table, they can't write to the transcript
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "You must be a participant to update the transcript"
                });
            }

            // 2. ACTION: Perform the update
            await db
                .update(meetings)
                .set({
                    transcript: sql`COALESCE(${meetings.transcript}, '[]'::jsonb) || ${JSON.stringify([input.line])}::jsonb`,
                })
                .where(
                    // We only check for Meeting ID now, because we validated the user above.
                    eq(meetings.id, input.meetingId)
                );

            return { success: true };
        }),

    // ---------------------------------------------------------
    // 2. GET TRANSCRIPT
    // Fetches the transcript and resolves User IDs to actual Names/Images.
    // FIX APPLIED: Changed from `createdByUserId` check to `meetingParticipants` check
    // so that invited attendees can also view the transcript.
    // ---------------------------------------------------------
    getTranscript: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ input, ctx }) => {
            const [existingMeeting] = await db
                .select()
                .from(meetings)
                // Security Join: Only allow if user is a participant
                .innerJoin(meetingParticipants, and(
                    eq(meetingParticipants.meetingId, meetings.id),
                    eq(meetingParticipants.userId, ctx.auth.user.id)
                ))
                .where(eq(meetings.id, input.id));

            if (!existingMeeting) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Meeting not found",
                })
            }

            // Note: because we did a join, the meeting data is inside the 'meetings' key of the result
            const meetingData = existingMeeting.meetings;

            if (!meetingData.transcript || meetingData.transcript.length === 0) {
                return []
            }

            const transcript = meetingData.transcript as TranscriptItem[]

            /* -------------------------------
               Resolve agent name
            -------------------------------- */
            const [agent] = await db
                .select({ id: agents.id, name: agents.name })
                .from(agents)
                .where(eq(agents.id, meetingData.agentId))

            /* -------------------------------
               Resolve all user IDs in transcript
            -------------------------------- */
            const userIds = Array.from(
                new Set(
                    transcript
                        .filter(t => t.role !== "assistant" && t.speaker !== "unknownUser")
                        .map(t => t.speaker)
                )
            );

            const usersMap = new Map<
                string,
                { name: string; image?: string | null }
            >()

            if (userIds.length > 0) {
                const fetchedUsers = await db
                    .select({
                        id: user.id,
                        name: user.name,
                        image: user.image,
                    })
                    .from(user)
                    .where(inArray(user.id, userIds))

                for (const user of fetchedUsers) {
                    usersMap.set(user.id, {
                        name: user.name,
                        image: user.image,
                    })
                }
            }

            /* -------------------------------
               Final transformed transcript
            -------------------------------- */
            return transcript.map(entry => {
                const isAssistant = entry.role === "assistant"
                const user = !isAssistant ? usersMap.get(entry.speaker) : null

                return {
                    ...entry,
                    speaker: isAssistant
                        ? agent?.name ?? "Assistant"
                        : user?.name ?? "Unknown User",

                    image: isAssistant ? undefined : user?.image ?? undefined,
                }
            })
        }),

    // accept invite received via url
    acceptInvite: protectedProcedure
        .input(z.object({
            meetingId: z.string(),
            token: z.string()
        }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.auth.user.id;

            // 1. Check if Meeting Exists
            const [meeting] = await db
                .select()
                .from(meetings)
                .where(eq(meetings.id, input.meetingId))
                .limit(1);

            if (!meeting) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
            }

            // 2. Check if user is ALREADY a participant
            const [existingParticipant] = await db
                .select()
                .from(meetingParticipants)
                .where(
                    and(
                        eq(meetingParticipants.meetingId, input.meetingId),
                        eq(meetingParticipants.userId, userId)
                    )
                )
                .limit(1);

            if (existingParticipant) {
                return { success: true, role: existingParticipant.role };
            }

            // 3. DETERMINE ROLE (The Logic Fix)
            let role = "attendee"; // Default

            if (input.token) {
                // Verify the token
                const [invite] = await db
                    .select()
                    .from(meetingInvites)
                    .where(eq(meetingInvites.id, input.token))
                    .limit(1);

                // Security Checks
                if (!invite) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid invite link" });
                }
                if (invite.meetingId !== input.meetingId) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "Link does not match meeting" });
                }
                if (new Date() > invite.expiresAt) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: "Invite link expired" });
                }

                // Grant the privileged role!
                role = invite.role;
            }

            // 4. Insert Participant with the CORRECT role
            await db.insert(meetingParticipants).values({
                meetingId: input.meetingId,
                userId: userId,
                role: role as ParticipantRole, // Cast to enum type
                joinedAt: new Date(),
                hasJoined: true,
            });

            return { success: true, role };
        }),

    // ---------------------------------------------------------
    // NEW: GET INVITE DETAILS
    // Validates the invite and returns meeting details for display
    // ---------------------------------------------------------
    getInviteDetails: protectedProcedure
        .input(z.object({
            token: z.string()
        }))
        .query(async ({ input }) => {
            // 1. Verify the token
            const [invite] = await db
                .select()
                .from(meetingInvites)
                .where(eq(meetingInvites.id, input.token))
                .limit(1);

            if (!invite) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid invite link" });
            }
            if (invite.meetingId !== invite.meetingId) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Link does not match meeting" });
            }
            if (new Date() > invite.expiresAt) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Invite link expired" });
            }

            // 2. Get meeting details
            const [meeting] = await db
                .select({
                    id: meetings.id,
                    name: meetings.name,
                    createdByUserId: meetings.createdByUserId,
                    createdByUsername: user.name,
                    createdByUserImage: user.image,
                    startsAt: meetings.startsAt,
                    agent: {
                        id: agents.id,
                        name: agents.name,
                    },
                })
                .from(meetings)
                .innerJoin(agents, eq(meetings.agentId, agents.id))
                .innerJoin(user, eq(meetings.createdByUserId, user.id))
                .where(eq(meetings.id, invite.meetingId))
                .limit(1);

            if (!meeting) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
            }

            return {
                meeting,
                role: invite.role
            };
        }),

    // ---------------------------------------------------------
    // 4. GENERATE LIVEKIT TOKEN
    // Called by the frontend just before connecting to the room.
    // FIX APPLIED: Added a DB check. Previously, anyone could generate a token 
    // for ANY room just by guessing the ID. Now it verifies participation.
    // ---------------------------------------------------------
    generateToken: protectedProcedure
        .input(z.object({ roomName: z.string() }))
        .mutation(async ({ ctx, input }) => {
            // SECURITY CHECK: Ensure user is actually a participant in this meeting
            const [participant] = await db
                .select()
                .from(meetingParticipants)
                .where(and(
                    eq(meetingParticipants.meetingId, input.roomName),
                    eq(meetingParticipants.userId, ctx.auth.user.id)
                ));

            if (!participant) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: "You are not authorized to join this meeting"
                });
            }

            const token = await generateLivekitToken(
                {
                    room_name: input.roomName,
                    participant_identity: ctx.auth.user.id,
                    participant_name: ctx.auth.user.name,
                }
            )
            const url = process.env.NEXT_PUBLIC_LIVEKIT_URL
            return { token, url }
        }),


    // ---------------------------------------------------------
    // 5. REMOVE MEETING
    // Completely deletes the meeting and all participants.
    // Restricted to the Creator/Owner only.
    // ---------------------------------------------------------
    remove: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const [removedMeeting] = await db
                .delete(meetings)
                .where(
                    and(
                        eq(meetings.id, input.id),
                        eq(meetings.createdByUserId, ctx.auth.user.id)
                    )
                )
                .returning()
            if (!removedMeeting) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Meeting not found"
                });
            }
            return removedMeeting
        }),

    // ---------------------------------------------------------
    // 6. LEAVE MEETING
    // Removes the current user from the participant list.
    // Does NOT delete the meeting itself.
    // ---------------------------------------------------------
    leave: protectedProcedure
        .input(z.object({ meetingId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            await db.delete(meetingParticipants)
                .where(and(
                    eq(meetingParticipants.meetingId, input.meetingId),
                    eq(meetingParticipants.userId, ctx.auth.user.id)
                ));

            return { success: true };
        }),

    // ---------------------------------------------------------
    // 7. UPDATE MEETING
    // Updates meeting details (name, status, etc.).
    // Restricted to Creator/Owner.
    // ---------------------------------------------------------
    update: protectedProcedure
        .input(meetingsUpdateSchema)
        .mutation(async ({ ctx, input }) => {
            const [updatedMeeting] = await db
                .update(meetings)
                .set(input)
                .where(
                    and(
                        eq(meetings.id, input.id),
                        eq(meetings.createdByUserId, ctx.auth.user.id)
                    )
                )
                .returning()
            if (!updatedMeeting) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Meeting not found"
                });
            }
            return updatedMeeting
        }),

    // ---------------------------------------------------------
    // 8. CREATE MEETING
    // Creates a meeting and atomically adds the creator as the "Host".
    // ---------------------------------------------------------
    create: premiumProcedure("meetings")
        .input(meetingsInsertSchema)
        .mutation(async ({ input, ctx }) => {
            return await db.transaction(async (tx) => {
                // 1. Create the Meeting
                const [createdMeeting] = await tx
                    .insert(meetings)
                    .values({
                        ...input,
                        createdByUserId: ctx.auth.user.id,
                    })
                    .returning();

                if (!createdMeeting) {
                    throw new Error("Failed to create meeting");
                }

                // 2. Add Creator as Host
                await tx.insert(meetingParticipants).values({
                    meetingId: createdMeeting.id,
                    userId: ctx.auth.user.id,
                    role: "host",
                });

                return createdMeeting;
            });
        }),

    // ---------------------------------------------------------
    // 9. GET ONE MEETING
    // Fetches a single meeting if the user is a participant.
    // Returns the meeting details + the user's role.
    // ---------------------------------------------------------
    getOne: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ input, ctx }) => {
            const [existingMeeting] = await db
                .select({
                    ...getTableColumns(meetings),
                    userRole: meetingParticipants.role,
                    agent: agents,
                    duration: sql<number>`EXTRACT(EPOCH FROM (${meetings.endedAt} - ${meetings.startedAt}))`.as("duration"),
                })
                .from(meetings)
                .innerJoin(agents, eq(meetings.agentId, agents.id))
                // Security Join
                .innerJoin(meetingParticipants, and(
                    eq(meetingParticipants.meetingId, meetings.id),
                    eq(meetingParticipants.userId, ctx.auth.user.id)
                ))
                .where(eq(meetings.id, input.id));

            if (!existingMeeting) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });
            }

            return existingMeeting;
        }),

    // ---------------------------------------------------------
    // 10. GET MANY MEETINGS (Dashboard)
    // Fetches all meetings the user is involved in (Host or Attendee).
    // Supports pagination, search, and filtering.
    // ---------------------------------------------------------
    getMany: protectedProcedure
        .input(z.object({
            page: z.number().default(DEFAULT_PAGE),
            pageSize: z.number().min(MIN_PAGE_SIZE).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
            search: z.string().nullish(),
            agentId: z.string().nullish(),
            status: z.enum([
                MeetingStatus.Upcoming,
                MeetingStatus.Active,
                MeetingStatus.Completed,
                MeetingStatus.Processing,
                MeetingStatus.Cancelled,
            ]).nullish()
        }))
        .query(async ({ ctx, input }) => {
            const { search, page, pageSize, status, agentId } = input;

            // Data Query
            const data = await db
                .select({
                    ...getTableColumns(meetings),
                    agent: agents,
                    duration: sql<number>`EXTRACT(EPOCH FROM (${meetings.endedAt} - ${meetings.startedAt}))`.as("duration"),
                    userRole: meetingParticipants.role,
                })
                .from(meetings)
                .innerJoin(agents, eq(meetings.agentId, agents.id))
                // Filter by User Participation
                .innerJoin(meetingParticipants, and(
                    eq(meetingParticipants.meetingId, meetings.id),
                    eq(meetingParticipants.userId, ctx.auth.user.id)
                ))
                .where(
                    and(
                        search ? ilike(meetings.name, `%${search}%`) : undefined,
                        status ? eq(meetings.status, status) : undefined,
                        agentId ? eq(meetings.agentId, agentId) : undefined,
                    )
                )
                .orderBy(desc(meetings.createdAt), desc(meetings.id))
                .limit(pageSize)
                .offset((page - 1) * pageSize);

            // Count Query (Must match filters)
            const [total] = await db
                .select({ count: count() })
                .from(meetings)
                .innerJoin(agents, eq(meetings.agentId, agents.id))
                .innerJoin(meetingParticipants, and(
                    eq(meetingParticipants.meetingId, meetings.id),
                    eq(meetingParticipants.userId, ctx.auth.user.id)
                ))
                .where(and(
                    search ? ilike(meetings.name, `%${search}%`) : undefined,
                    status ? eq(meetings.status, status) : undefined,
                    agentId ? eq(meetings.agentId, agentId) : undefined,
                ));

            const totalPages = Math.ceil(total.count / pageSize);

            return {
                items: data,
                total: total.count,
                totalPages,
            };
        }),
    // 11 ask ai questions about ended meeting
    askAi: protectedProcedure
        .input(z.object({
            meetingId: z.string(),
            question: z.string().min(3),
        }))
        .mutation(async ({ ctx, input }) => {
            // 1. Fetch Source of Truth from DB
            // We only fetch what we need to save memory
            const [meetingData] = await db
                .select()
                .from(meetings)
                // Security Join: Only allow if user is a participant
                .innerJoin(meetingParticipants, and(
                    eq(meetingParticipants.meetingId, meetings.id),
                    eq(meetingParticipants.userId, ctx.auth.user.id)
                ))
                .where(eq(meetings.id, input.meetingId));

            if (!meetingData) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Meeting not found or access denied.",
                });
            }

            // 2. Prepare context
            // We stringify the transcript array into a readable format for Gemini
            const transcriptContext = meetingData.meetings.transcript
                .map((t) => `[${t.role}] ${t.speaker}: ${t.text}`)
                .join("\n");

            try {


                const result = await generateObject({
                    model: google("gemini-2.5-flash-lite"),

                    schema: z.object({
                        answer: z
                            .string()
                            .describe("The direct answer to the user's question"),
                        relatedQuestions: z
                            .array(z.string())
                            .length(3)
                            .describe("3 follow-up questions"),
                    }),

                    system: `
                        You are a meeting assistant for "MeetAI".

                        Meeting Context
                        Summary: ${meetingData.meetings.summary}
                        Transcript: ${transcriptContext}

                        Instructions
                        - Answer strictly from the provided context.
                        - If the answer is not available, say so explicitly.
                        - Do not use markdown.
                    `.trim(),

                    prompt: input.question,
                });

                return {
                    answer: result.object.answer,
                    suggestions: result.object.relatedQuestions,
                };
            } catch (error) {
                console.error("AI Generation Error:", error);
                throw new TRPCError({
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to generate AI response.",
                });
            }
        }),
})