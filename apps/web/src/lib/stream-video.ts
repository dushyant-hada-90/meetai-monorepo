import "server-only"
// 1. Import RoomServiceClient
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';
// 2. Import your DB instance and schema
import { db } from '@/db';
import { agents, meetings } from '@/db/schema';
import { and, eq } from 'drizzle-orm';

// Initialize the RoomService (needed to update room metadata)
const roomService = new RoomServiceClient(
  process.env.NEXT_PUBLIC_LIVEKIT_URL!,
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
const key = process.env.LIVEKIT_API_KEY || "";
const secret = process.env.LIVEKIT_API_SECRET || "";
const url = process.env.LIVEKIT_API_URL || "";

console.log("--- VERCEL AUTH DEBUG ---");
console.log(`URL: ${url}`);
console.log(`Key First/Last: ${key[0]}...${key[key.length-1]}`);
console.log(`Secret Length: ${secret.length}`);
console.log(`Secret Corrupted? ${secret.includes('"') || secret.includes(" ") ? "YES" : "NO"}`);
console.log("-------------------------");

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
        and(
          eq(meetings.id, roomName),
          eq(meetings.userId, participantIdentity),
        )
      )
    const [agentData] = await db.
      select()
      .from(agents)
      .where(
        and(
          eq(agents.id, meetingData.agentId),
          eq(agents.userId, participantIdentity),
        )
      )



    if (meetingData) {
      // Construct the context object your Agent expects
      const contextData = {
        meetingData,
        agentData
      };
      roomMetadata = JSON.stringify(contextData);
    }
  } catch (error) {
    console.error("Failed to fetch meeting context:", error);
  }

  // ---------------------------------------------------------
  // STEP 2: Prime the Room with Metadata
  // ---------------------------------------------------------
  // We explicitly create the room (or update it if it exists) 
  // with the metadata BEFORE the participant joins.
  try {
    await roomService.createRoom({
      name: roomName,
      emptyTimeout: 10 * 60, // 10 minutes
      metadata: roomMetadata, // <--- THIS is where we push the data
    });
  } catch (e) {
    // If room already exists, we might want to update it just in case
    // typically createRoom is idempotent regarding existence, but updates metadata
    console.log("Room might already exist or service error", e);
  }

  // ---------------------------------------------------------
  // STEP 3: Generate Token (Standard)
  // ---------------------------------------------------------
  const at = new AccessToken(process.env.LIVEKIT_API_KEY, process.env.LIVEKIT_API_SECRET, {
    identity: participantIdentity,
    name: participantName,
    metadata: body.participant_metadata ?? '',
    attributes: body.participant_attributes ?? {},
    ttl: '10m',
  });

  at.addGrant({ roomJoin: true, room: roomName });
  const token = await at.toJwt();

  return token;
}