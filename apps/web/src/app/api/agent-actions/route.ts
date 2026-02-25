// src/app/api/agent-actions/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Log the received data to your terminal
    console.log("📩 Received action from Agent:", JSON.stringify(body, null, 2));

    // Always return a 200 OK so the agent knows the call succeeded
    return NextResponse.json({ success: true, message: "Action received" });
    
  } catch (error) {
    console.error("❌ Error in agent-actions route:", error);
    return NextResponse.json(
      { success: false, error: "Invalid payload" },
      { status: 400 }
    );
  }
}