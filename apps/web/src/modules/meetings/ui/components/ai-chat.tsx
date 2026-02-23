'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { useMutation } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { toast } from 'sonner';
import { useAuth } from '@/modules/auth/ui/components/auth-provider';
import { GeneratedAvatar } from '@/components/generated-avatar';

// --- Types ---
type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

interface Props {
  meetingId: string;
}
const MIN_QUESTION_LENGTH = 3;

export function AiChat({ meetingId }: Props) {
  const trpc = useTRPC();
  const { session } = useAuth();
  const currentUser = session?.user;

  const askAiMutation = useMutation(
    trpc.meetings.askAi.mutationOptions()
  );

  const isLoading = askAiMutation.isPending;

  const [messages, setMessages] = useState<Message[]>([]);

  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Seed the assistant's opening message on the client to avoid SSR/CSR time mismatches
  useEffect(() => {
    setMessages([
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content:
          "Hello! I've analyzed the meeting transcript. What would you like to know?",
        timestamp: new Date(),
      },
    ]);
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const sendQuestion = async (question: string) => {
    const trimmed = question.trim();

    if (isLoading) return;

    if (trimmed.length < MIN_QUESTION_LENGTH) {
      toast.error('Question must be at least 3 characters long');
      return; // API never fires
    }

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: question,
        timestamp: new Date(),
      },
    ]);

    setInputValue('');
    setSuggestions([]);

    try {
      const res = await askAiMutation.mutateAsync({
        meetingId,
        question,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: res.answer,
          timestamp: new Date(),
        },
      ]);

      setSuggestions(res.suggestions);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: 'Sorry, I could not generate a response.',
          timestamp: new Date(),
        },
      ]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuestion(inputValue);
  };

  return (
    <div className="bg-card border rounded-lg shadow-sm h-full min-h-0 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b">
        <span className="p-2 rounded-full bg-primary/10 text-primary">
          <Sparkles className="w-4 h-4" />
        </span>
        <div>
          <p className="text-sm font-medium">Meeting assistant</p>
          <p className="text-xs text-muted-foreground">
            Ask about action items, decisions, and notes
          </p>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0 px-4 py-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'flex w-full gap-3',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {message.role === 'assistant' && (
                <Avatar className="w-8 h-8 border">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    <Bot className="w-4 h-4" />
                  </AvatarFallback>
                </Avatar>
              )}

              <div
                className={cn(
                  'flex flex-col max-w-[75%] rounded-2xl px-4 py-2.5 text-sm shadow-sm',
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                    : 'bg-muted border rounded-tl-sm'
                )}
              >
                <p className="whitespace-pre-line">{message.content}</p>
                <span className="text-[10px] mt-1 opacity-70 self-end">
                  {message.timestamp.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>

              {message.role === 'user' && (
                <Avatar className="w-8 h-8 border shrink-0">
                  {currentUser?.image ? (
                    <AvatarImage
                      src={currentUser.image}
                      alt={currentUser.name ?? 'User'}
                    />
                  ) : currentUser?.name ? (
                    <AvatarFallback className="p-0 bg-transparent">
                      <GeneratedAvatar
                        seed={currentUser.name}
                        variant="initials"
                        className="h-8 w-8 rounded-full"
                      />
                    </AvatarFallback>
                  ) : (
                    <AvatarFallback className="bg-muted text-muted-foreground">
                      <User className="w-4 h-4" />
                    </AvatarFallback>
                  )}
                </Avatar>
              )}

            </div>
          ))}

          {/* Loader bubble */}
          {isLoading && (
            <div className="flex w-full gap-3 justify-start">
              <Avatar className="w-8 h-8 border">
                <AvatarFallback className="bg-primary/10 text-primary">
                  <Bot className="w-4 h-4" />
                </AvatarFallback>
              </Avatar>
              <div className="bg-muted border rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1">
                <span className="w-1.5 h-1.5 bg-muted-foreground/70 rounded-full animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 bg-muted-foreground/70 rounded-full animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 bg-muted-foreground/70 rounded-full animate-bounce" />
              </div>
            </div>
          )}

          {/* Suggestions */}
          {suggestions.length > 0 && !isLoading && (
            <div className="flex flex-wrap gap-2">
              {suggestions.map((q) => (
                <button
                  key={q}
                  onClick={() => sendQuestion(q)}
                  className="text-xs px-3 py-1.5 rounded-full border bg-muted hover:bg-muted/70 transition"
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t px-4 py-3">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Ask about the meeting..."
            disabled={isLoading}
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !inputValue.trim()}
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
