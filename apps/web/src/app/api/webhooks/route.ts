import { db } from "@/db";
import { meetings } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { eq } from "drizzle-orm";
import { WebhookReceiver } from "livekit-server-sdk";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    // Initialize the receiver with your credentials inside the handler
    // to ensure they are available and current.
    const receiver = new WebhookReceiver(
        process.env.LIVEKIT_API_KEY!,
        process.env.LIVEKIT_API_SECRET!
    );
    
    console.log("Webhook hit!")
    // 1. Get the raw body as text (required for signature validation)
    const body = await req.text();
    // console.log("Body length:", body.length)

    // 2. Get the Authorization header (the signed JWT)
    const headerList = headers();
    const authorization = (await headerList).get("Authorization");

    if (!authorization) {
        return NextResponse.json({ error: "No authorization header" }, { status: 400 });
    }

    try {
        // 3. Validate and decode the event
        const event = await receiver.receive(body, authorization);

        console.log(`LiveKit Webhook received: ${event.event}`);

        // Handle the "Room Started" event - set meeting status to active
        if (event.event === 'room_started' && event.room?.name) {
            await db
                .update(meetings)
                .set({ status: "active", startedAt: new Date() })
                .where(eq(meetings.id, event.room.name));

            console.log(`Meeting ${event.room.name} status set to active`);
        }

        // Handle the "Room Finished" event — trigger AI summarization
        if (event.event === 'room_finished' && event.room?.name) {
            let startedAt: Date = new Date();
            try {
                // creationTime may be bigint (seconds since epoch) in the proto
                const ts = event.room.creationTime;
                if (ts) startedAt = new Date(Number(ts) * 1000);
            } catch { /* use current time as fallback */ }

            await inngest.send({
                name: "livekit/room_finished",
                data: {
                    meetingId: event.room.name,
                    startedAt,
                    endedAt: new Date(),
                },
            });

            console.log(`Meeting ${event.room.name} sent for processing`);
        }

        // 5. Always return a 200 OK to LiveKit so it stops retrying
        return NextResponse.json({ received: true }, { status: 200 });
    } catch (error) {
        console.error("Webhook validation failed:", error);
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
}