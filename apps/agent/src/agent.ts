import "dotenv/config";
import { defineAgent, type JobContext, WorkerOptions, cli, voice } from '@livekit/agents';
import * as google from '@livekit/agents-plugin-google';
import { fileURLToPath } from 'node:url';
import { Modality } from '@google/genai';
import { RoomEvent, Participant } from '@livekit/rtc-node';

export default defineAgent({
  entry: async (ctx: JobContext) => {
    await ctx.connect();
    console.log("✅ Agent connected. Room:", ctx.room.name);
    console.log("🔍 Metadata on Connect:", ctx.room.metadata);

    // --- 1. DYNAMIC CONTEXT STATE ---
    let contextState = {
      meetingName: "Default Meeting",
      agentName: "AI Assistant",
      instructions: "You are a helpful assistant."
    };

    // Helper to parse metadata safely
    const parseMetadata = (metadata: string | undefined) => {
      if (!metadata) return null;
      try {
        const data = JSON.parse(metadata);
        return {
           meetingName: data.meetingData?.name || "Default Meeting",
           agentName: data.agentData?.name || "AI Assistant",
           instructions: data.agentData?.instructions || "You are a helpful assistant."
        };
      } catch (e) {
        console.error("⚠️ Invalid JSON metadata:", metadata);
        return null;
      }
    };

    // Initial Load (Read from the token you just generated)
    const initialData = parseMetadata(ctx.room.metadata);
    if (initialData) {
      contextState = initialData;
      console.log(`🧠 Initial Persona: ${contextState.agentName} for "${contextState.meetingName}"`);
    }

    // Helper to generate the prompt string
    const getSystemPrompt = () => {
      return `
        You are a helpful voice AI assistant named ${contextState.agentName}.
        The current meeting is "${contextState.meetingName}".
        
        Your Core Instructions: ${contextState.instructions}
        
        IMPORTANT:
        - Speak in natural, conversational plain text.
        - Keep your responses concise and professional.
        - Your knowledge cutoff is 2025-01.
      `;
    };

    // --- 2. INITIALIZE AGENT (Pass string, not function) ---
    const agent = new voice.Agent({
      instructions: getSystemPrompt(), // <--- Calling the function immediately to get a STRING
    });

    const session = new voice.AgentSession({
      llm: new google.beta.realtime.RealtimeModel({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        voice: 'Puck',
        temperature: 0.8,
        instructions: getSystemPrompt(), 
        modalities: [Modality.AUDIO],
      }),
    });

    // --- 3. LIVE METADATA LISTENER ---
    // Since we can't update agent.instructions directly, we update the state
    // and let the *session* know for the next turn if possible, or just rely on the next generation.
    ctx.room.on(RoomEvent.RoomMetadataChanged, (metadata) => {
      console.log("🔄 Metadata Updated:", metadata);
      const newData = parseMetadata(metadata);
      if (newData) {
        contextState = newData;
        console.log(`🧠 Brain Updated: Now acting as ${contextState.agentName}`);
        
        // RE-GENERATE REPLY triggers a context update in most LLM sessions
        // We can't force the 'agent' object to change, but we can change what we tell the LLM next.
      }
    });

    // --- 4. BROADCAST HELPER ---
    const broadcast = (role: 'human' | 'assistant', text: any, isFinal: boolean) => {
      let safeText = "";
      if (typeof text === 'string') safeText = text;
      else if (typeof text === 'object') safeText = text.text || text.message || JSON.stringify(text);

      if (!safeText || safeText.trim() === "" || safeText === "{}") return;

      const speakerName = role === 'human' ? "User" : contextState.agentName;

      console.log(`📡 BROADCAST [${speakerName}]: "${safeText.substring(0, 30)}..."`);

      const payload = JSON.stringify({
        type: 'transcript_update',
        role: role,
        speaker: speakerName,
        text: safeText,
        timestamp: Date.now(),
        isFinal: isFinal
      });

      // FIX: Optional chaining to prevent crash on disconnect
      ctx.room.localParticipant?.publishData(new TextEncoder().encode(payload), { reliable: true });
    };

    // --- 5. EVENT LISTENERS ---
    // @ts-ignore
    session.on('user_input_transcribed', (e: any) => {
      const text = typeof e === 'string' ? e : e.text;
      const isFinal = e.isFinal ?? false;
      broadcast('human', text, isFinal);
    });

    // @ts-ignore
    session.on('conversation_item_added', (e: any) => {
      const item = e.item || e; 
      if (item.type !== 'message' && !item.role) return;

      let extractedText = "";
      if (typeof item.content === 'string') extractedText = item.content;
      else if (Array.isArray(item.content)) {
         extractedText = item.content.map((p: any) => (typeof p === 'string' ? p : p.text || "")).join(" ");
      }

      if (extractedText) {
          const role = item.role === 'user' ? 'human' : 'assistant';
          broadcast(role, extractedText, true);
      }
    });

    await session.start({ agent, room: ctx.room });

    // Initial Greeting using dynamic name
    // We pass the instructions HERE again to ensure the very first message is correct
    await session.generateReply({ 
        instructions: `Greet the user as ${contextState.agentName} and mention the meeting "${contextState.meetingName}".` 
    });
  },
});

cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));