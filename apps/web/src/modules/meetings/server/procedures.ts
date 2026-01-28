import { db } from "@/db"
import { agents, meetings, TranscriptItem, user } from "@/db/schema"
import { createTRPCRouter, premiumProcedure, protectedProcedure } from "@/trpc/init"
import { TRPCError } from "@trpc/server"
import { z } from "zod"
import { and, count, desc, eq, getTableColumns, ilike, inArray, sql } from "drizzle-orm"
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, MIN_PAGE_SIZE } from "@/constants"
import { meetingsInsertSchema, meetingsUpdateSchema } from "../schemas"
import { MeetingStatus } from "../types"
import { generateLivekitToken } from "@/lib/stream-video"
import { formatDuration } from "@/lib/utils"

export const meetingsRouter = createTRPCRouter({
    getTranscript: protectedProcedure
        .input(z.object({ id: z.string() }))
        .query(async ({ input, ctx }) => {
            const [existingMeeting] = await db
                .select()
                .from(meetings)
                .where(
                    and(
                        eq(meetings.id, input.id),
                        eq(meetings.userId, ctx.auth.user.id)
                    )
                )

            if (!existingMeeting) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Meeting not found",
                })
            }

            if (!existingMeeting.transcript || existingMeeting.transcript.length === 0) {
                return []
            }

            const transcript = existingMeeting.transcript as TranscriptItem[]

            /* -------------------------------
               Resolve agent
            -------------------------------- */
            const [agent] = await db
                .select({ id: agents.id, name: agents.name })
                .from(agents)
                .where(eq(agents.id, existingMeeting.agentId))

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
    generateToken: protectedProcedure
        .input(z.object({ roomName: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const token = await generateLivekitToken(
                {
                    room_name: input.roomName,
                    participant_identity: ctx.auth.user.id,
                    participant_name: ctx.auth.user.name
                }
            )
            const url = process.env.NEXT_PUBLIC_LIVEKIT_URL
            return { token, url }
        }),


    remove: protectedProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const [removedMeeting] = await db
                .delete(meetings)
                .where(
                    and(
                        eq(meetings.id, input.id),
                        eq(meetings.userId, ctx.auth.user.id)
                    )
                )
                .returning()
            if (!removedMeeting) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "meeting not found"
                });
            }
            return removedMeeting
        }),
    update: protectedProcedure
        .input(meetingsUpdateSchema)
        .mutation(async ({ ctx, input }) => {
            const [updatedMeeting] = await db
                .update(meetings)
                .set(input)
                .where(
                    and(
                        eq(meetings.id, input.id),
                        eq(meetings.userId, ctx.auth.user.id)
                    )
                )
                .returning()
            if (!updatedMeeting) {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "meeting not found"
                });
            }
            return updatedMeeting
        }),
    create: premiumProcedure("meetings")
        .input(meetingsInsertSchema)
        .mutation(async ({ input, ctx }) => {
            const [createdMeeting] = await db
                .insert(meetings)
                .values({
                    ...input,
                    userId: ctx.auth.user.id,
                })
                .returning()

            // LiveKit rooms are created automatically when participants join
            // No need to pre-create rooms like with Stream

            return createdMeeting
        }),

    getOne: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
        const [existingMeeting] = await db
            .select({
                ...getTableColumns(meetings),
                agent: agents,
                duration: sql<number>`EXTRACT(EPOCH FROM (ended_at - started_at))`.as("duration"),
            })
            .from(meetings)
            .innerJoin(agents, eq(meetings.agentId, agents.id))
            .where(and(
                eq(meetings.id, input.id),
                eq(meetings.userId, ctx.auth.user.id)
            ))
        if (!existingMeeting) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Meeting not found" });

        }
        return existingMeeting
    }),


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
            ])
                .nullish()
        })
        )
        .query(async ({ ctx, input }) => {
            const { search, page, pageSize, status, agentId } = input
            const data = await db
                .select({
                    ...getTableColumns(meetings),
                    agent: agents,
                    duration: sql<number>`EXTRACT(EPOCH FROM (ended_at - started_at))`.as("duration")
                })
                .from(meetings)
                .innerJoin(agents, eq(meetings.agentId, agents.id))
                .where(
                    and(
                        eq(meetings.userId, ctx.auth.user.id),
                        search ? ilike(meetings.name, `%${search}%`) : undefined,
                        status ? eq(meetings.status, status) : undefined,
                        agentId ? eq(meetings.agentId, agentId) : undefined,
                    )
                )
                .orderBy(desc(meetings.createdAt), desc(meetings.id))
                .limit(pageSize)
                .offset((page - 1) * pageSize)

            const [total] = await db.select({ count: count() })
                .from(meetings)
                .innerJoin(agents, eq(meetings.agentId, agents.id))
                .where(and(
                    eq(meetings.userId, ctx.auth.user.id),
                    search ? ilike(meetings.name, `%${search}%`) : undefined,
                    status ? eq(meetings.status, status) : undefined,
                    agentId ? eq(meetings.agentId, agentId) : undefined,
                )
                )
            const totalPages = Math.ceil(total.count / pageSize)
            // for testing:
            // throw new TRPCError({code:"BAD_REQUEST"});
            // await new Promise((resolve) => setTimeout(resolve, 5000));

            return {
                items: data,
                total: total.count,
                totalPages,
            }
        }),


})