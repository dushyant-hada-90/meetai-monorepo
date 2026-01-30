import { db } from "@/db";
import { meetings } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { eq } from "drizzle-orm";
import { WebhookReceiver } from "livekit-server-sdk";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

// Initialize the receiver with your credentials
const receiver = new WebhookReceiver(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!
);

export async function POST(req: NextRequest) {
    console.log("Webhook hit!")
    // 1. Get the raw body as text (required for signature validation)
    const body = await req.text();
    // console.log(body)

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
                .set({ status: "active" })
                .where(eq(meetings.id, event.room.name));

            console.log(`Meeting ${event.room.name} status set to active`);
        }
        // console.log(event.room)
        // Handle the "Room Finished" event
        // Inside your app/api/webhooks/livekit/route.ts POST handler
        if (event.event === 'room_finished') {
            await inngest.send({
                name: "livekit/room_finished",
                data: {
                    meetingId: event.room?.name, // Assuming meetingName/Id is passed here
                    startedAt: new Date(Number(event.room?.creationTimeMs)),
                    endedAt: new Date() // this is the time when webhook was cereated which marks the end of meeting
                },
            });
        }

        // 5. Always return a 200 OK to LiveKit so it stops retrying
        return NextResponse.json({ received: true }, { status: 200 });
    } catch (error) {
        console.error("Webhook validation failed:", error);
        return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
}