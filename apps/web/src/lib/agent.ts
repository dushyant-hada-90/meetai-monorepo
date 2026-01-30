// This file is just for refernce , actual code is in a seperate repo named meetai-agent

// import 'dotenv/config';
// import {
//   type JobContext,
//   ServerOptions,
//   cli,
//   defineAgent,
//   voice,
// } from '@livekit/agents';
// import * as google from '@livekit/agents-plugin-google';
// import dotenv from 'dotenv';
// import { fileURLToPath } from 'node:url';

// dotenv.config({ path: '.env.local' });

// class Assistant extends voice.Agent {
//   public agentName: string;

//   constructor(name: string, instructions: string) {
//     super({ instructions });
//     this.agentName = name;
//   }
// }

// export default defineAgent({
//   entry: async (ctx: JobContext) => {
//     console.log("----------------- AGENT STARTING ----------------------");
//     await ctx.connect();

//     // 1. Initialize Sequence Counter
//     let transcriptIndex = 0;
    
//     const meetingId = ctx.room.name;
//     if (!meetingId) {
//       console.error("No meeting ID found in room name.");
//       return;
//     }

//     // 2. Metadata Parsing
//     let currentMeeting = { id: "unknown", name: "Meeting" };
//     let currentAgent = { name: "AI Assistant", instructions: "You are a helpful assistant." };

//     if (ctx.room.metadata) {
//       try {
//         const data = JSON.parse(ctx.room.metadata);
//         if (data.meetingData) currentMeeting = data.meetingData;
//         if (data.agentData) currentAgent = data.agentData;
//       } catch (e) {
//         console.error("Failed to parse metadata", e);
//       }
//     }

//     // 3. Configure the LLM
//     const finalInstructions = `
//       You are a helpful voice AI assistant named ${currentAgent.name}.
//       The current meeting name is "${currentMeeting.name}".
//       Your Core Instructions: ${currentAgent.instructions}
//       IMPORTANT: Default language is English.
//     `;

//     const session = new voice.AgentSession({
//       llm: new google.beta.realtime.RealtimeModel({
//         voice: 'Puck', 
//       }),
//     });

//     // 4. Data Broadcasting (The "Writer")
//     session.on(voice.AgentSessionEventTypes.ConversationItemAdded, async (event) => {
//       const text = event.item.textContent;
//       if (!text || text.trim().length === 0) return;

//       let assignedRole = "assistant";
//       let speakerName = currentAgent.name;

//       if (event.item.role === 'user') {
//         assignedRole = "human";
        
//         // Fix: Use the first remote participant as the default "Human" speaker
//         const firstRemote = Array.from(ctx.room.remoteParticipants.values())[0];
//         speakerName = firstRemote?.identity || "unknown_user";
//       }

//       const payload = {
//         role: assignedRole,
//         speaker: speakerName,
//         text: text,
//         timestamp: Date.now(),
//         type: 'transcript_update',
//         index: transcriptIndex++, 
//       };

//       const data = new TextEncoder().encode(JSON.stringify(payload));
//       await ctx.room.localParticipant?.publishData(data, { reliable: true });
      
//       console.log(`[Broadcasting] #${payload.index} ${assignedRole}: ${text.substring(0, 30)}...`);
//     });

//     // 5. Start Session
//     await session.start({
//       agent: new Assistant(currentAgent.name, finalInstructions),
//       room: ctx.room,
//       outputOptions: {
//         transcriptionEnabled: true,
//         syncTranscription: false,
//       }
//     });

//    const handle = session.generateReply({
//       instructions: `Greet the user as ${currentAgent.name}. Mention that you are ready for the "${currentMeeting.name}" meeting.`,
//     });

//     await handle.waitForPlayout();
//   },
// });

// if (process.argv[1] === fileURLToPath(import.meta.url)) {
//   cli.runApp(new ServerOptions({ agent: fileURLToPath(import.meta.url) }));
// }