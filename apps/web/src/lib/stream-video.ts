import "server-only"
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
import { db } from '@/db';
import { agents, meetings } from '@/db/schema';
import { eq } from 'drizzle-orm';

// Initialize the RoomService (needed to set room metadata)
const roomService = new RoomServiceClient(
  process.env.LIVEKIT_URL!,
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!
);

interface TokenRequest {
  room_name?: string;
  participant_identity?: string;
  participant_name?: string;
  participant_metadata?: string;
  participant_attributes?: Record<string, string>;
}

export const generateLivekitToken = async (body: TokenRequest) => {
  // server.js or where you create roomService
  // const key = process.env.LIVEKIT_API_KEY || "";
  // const secret = process.env.LIVEKIT_API_SECRET || "";
  // const url = process.env.LIVEKIT_URL || "";

  // console.log("--- VERCEL AUTH DEBUG ---");
  // console.log(`URL: ${url}`);
  // console.log(`Key First/Last: ${key[0]}...${key[key.length-1]}`);
  // console.log(`Secret Length: ${secret.length}`);
  // console.log(`Secret Corrupted? ${secret.includes('"') || secret.includes(" ") ? "YES" : "NO"}`);
  // console.log("-------------------------");

  const roomName = body.room_name ?? 'quickstart-room';
  const participantIdentity = body.participant_identity ?? 'quickstart-identity';
  const participantName = body.participant_name ?? 'quickstart-username';

  // ---------------------------------------------------------
  // STEP 1: Fetch Instructions from Neon DB (Server-Side)
  // ---------------------------------------------------------
  // This runs on your Next.js server, so the DB connection is fast and secure.
  let roomMetadata = JSON.stringify({
    instructions: "Default instructions",
    context: "No context provided"
  });

  try {
    const [meetingData] = await db.
      select()
      .from(meetings)
      .where(
        eq(meetings.id, roomName)
      );

    if (meetingData) {
      const [agentData] = await db.
        select()
        .from(agents)
        .where(
          eq(agents.id, meetingData.agentId)
        );

      if (agentData) {
        // Construct the context object your Agent expects
        const contextData = {
          meetingData,
          agentData
        };
        roomMetadata = JSON.stringify(contextData);
      }
    }
  } catch (error) {
    console.error("Failed to fetch meeting context:", error);
  }

  // // ---------------------------------------------------------
  // STEP 2: Prime or Update the Room with Metadata
  // ---------------------------------------------------------
  try {
    // Attempt to create the room with metadata
    await roomService.createRoom({
      name: roomName,
      emptyTimeout: 10 * 60,
      metadata: roomMetadata,
    });
  } catch (e: unknown) {
    if (
      e instanceof Error &&
      (
        e.message.includes("already exists") ||
        ("code" in e && typeof (e as { code?: unknown }).code === "number" && (e as { code: number }).code === 409)
      )
    ) {
      console.log(`[TokenGen] Room ${roomName} exists. Updating metadata...`);
      try {
        await roomService.updateRoomMetadata(roomName, roomMetadata);
      } catch (updateErr) {
        console.error("Failed to update room metadata:", updateErr);
      }
    } else {
      console.log("Error creating room (non-fatal):", e);
    }
  }

  // ---------------------------------------------------------
  // STEP 3: Generate Token (auto-dispatch — no explicit dispatch needed)
  //         The agent uses automatic dispatch (no agentName in ServerOptions),
  //         so LiveKit dispatches to any available agent worker when a
  //         participant connects. Room metadata provides meeting context.
  // ---------------------------------------------------------
  const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity: participantIdentity,
    name: participantName,
    metadata: body.participant_metadata ?? '',
    attributes: body.participant_attributes ?? {},
    ttl: '10m',
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    roomList: true,
    roomAdmin: true,
  });

  console.log(`[TokenGen] Token generated for room "${roomName}" (auto-dispatch, metadata set on room)`);

  const token = await at.toJwt();

  return token;
}