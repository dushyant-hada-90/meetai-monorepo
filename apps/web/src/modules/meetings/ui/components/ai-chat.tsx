'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

// --- Types ---
type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

export function AiChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hello! I've analyzed the meeting transcript. What would you like to know about the discussion?",
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Auto-scroll to bottom ref
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!inputValue.trim() || isLoading) return;

    // 1. Add User Message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // =================================================================================
      // 🟢 YOUR FETCH LOGIC GOES HERE
      // =================================================================================
      //
      // In a real scenario, you would likely:
      // 1. Call your API endpoint (e.g., /api/chat)
      // 2. Pass the `inputValue` (question) and `meetingId`
      // 3. Await the response
      //
      // Example:
      // const response = await fetch('/api/chat', {
      //   method: 'POST',
      //   body: JSON.stringify({ query: inputValue, meetingContext: ... })
      // });
      // const data = await response.json();
      // const aiResponseText = data.answer; 
      
      // --- SIMULATION (Remove this block when implementing real logic) ---
      await new Promise((resolve) => setTimeout(resolve, 1500)); // Fake delay
      const aiResponseText = "This is a simulated response. Once you connect your API in the code block above, I will answer based on the actual meeting context.";
      // ------------------------------------------------------------------

      // =================================================================================

      // 2. Add AI Response
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: aiResponseText,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Failed to fetch answer:", error);
      // Optional: Add an error message to chat state
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-white border rounded-lg shadow-sm h-full min-h-0 flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        <span className="p-2 rounded-full bg-primary/10 text-primary">
          <Sparkles className="w-4 h-4" />
        </span>
        <div>
          <p className="text-sm font-medium text-foreground">Meeting assistant</p>
          <p className="text-xs text-muted-foreground">Ask about action items, decisions, and notes</p>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0 px-4 py-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex w-full gap-3",
                message.role === 'user' ? "justify-end" : "justify-start"
              )}
            >
              {message.role === 'assistant' && (
                <Avatar className="w-8 h-8 border">
                  <AvatarImage src="/bot-avatar.png" />
                  <AvatarFallback className="bg-primary/10 text-primary">
                    <Bot className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
              )}

              <div
                className={cn(
                  "flex flex-col max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
                  message.role === 'user'
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted text-foreground border border-border rounded-tl-sm"
                )}
              >
                <p className="leading-relaxed whitespace-pre-line">{message.content}</p>
                <span
                  className={cn(
                    "text-[10px] mt-1 opacity-70",
                    message.role === 'user' ? "text-primary-foreground/80 self-end" : "text-muted-foreground"
                  )}
                >
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {message.role === 'user' && (
                <Avatar className="w-8 h-8 border">
                  <AvatarImage src="/user-avatar.png" />
                  <AvatarFallback className="bg-muted text-muted-foreground">
                    <User className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex w-full gap-3 justify-start">
              <Avatar className="w-8 h-8 border">
                <AvatarFallback className="bg-primary/10 text-primary">
                  <Bot className="w-4 h-4" />
                </AvatarFallback>
              </Avatar>
              <div className="bg-muted border border-border rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-muted-foreground/70 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-muted-foreground/70 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-muted-foreground/70 rounded-full animate-bounce"></span>
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      <div className="border-t px-4 py-3 bg-background">
        <form
          onSubmit={handleSendMessage}
          className="flex w-full items-center gap-2"
        >
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask about the meeting..."
            className="flex-1"
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !inputValue.trim()}
            aria-label="Send message"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}