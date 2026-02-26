import {
  pgTable,
  text,
  timestamp,
  boolean,
  pgEnum,
  jsonb,
  primaryKey,
  index
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";

// ----------------------------------------------------------------------
// User & Auth Tables (Better Auth)
// ----------------------------------------------------------------------

export const user = pgTable("user", {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').$defaultFn(() => false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp('updated_at').$defaultFn(() => new Date()).notNull()
});

export const session = pgTable("session", {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' })
});

export const account = pgTable("account", {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull()
});

export const verification = pgTable("verification", {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').$defaultFn(() => new Date()),
  updatedAt: timestamp('updated_at').$defaultFn(() => new Date())
});

// ----------------------------------------------------------------------
// App Specific Tables
// ----------------------------------------------------------------------

export const agents = pgTable("agents", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: text("name").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  instructions: text("instructions").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const meetingStatus = pgEnum("meeting_status", [
  "upcoming",
  "active",
  "completed",
  "processing",
  "cancelled",
  "abandoned",
]);

export const participantRole = pgEnum("participant_role", [
  "host",
  "co_host",
  "attendee",
  "viewer"
]);

export type AgentId = string;
export type UserId = string;
export type ParticipantRole = typeof participantRole.enumValues[number];

export interface TranscriptItem {
  role: "human" | "assistant";
  speaker: AgentId | UserId | "unknownUser";
  text: string;
  timestamp: number;
}

export const meetings = pgTable("meetings", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),
  name: text("name").notNull(),
  createdByUserId: text("created_by_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  agentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),

  status: meetingStatus("status").notNull().default("upcoming"),

  // NEW: The scheduled time (Planned)
  startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }),

  // The actual execution times (Real)
  startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
  endedAt: timestamp("ended_at", { withTimezone: true, mode: "date" }),

  transcript: jsonb("transcript")
    .$type<TranscriptItem[]>()
    .notNull()
    .default([]),
  summary: text("summary"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow()
});

export const meetingParticipants = pgTable("meeting_participants", {
  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  role: participantRole("role").notNull().default("attendee"),
  hasAccepted: boolean("has_accepted").default(false),
  invitedAt: timestamp("invited_at").defaultNow().notNull(),
  joinedAt: timestamp("joined_at"),
}, (t) => ({
  // Composite Primary Key: Ensures unique user-meeting pair
  pk: primaryKey({ columns: [t.meetingId, t.userId] }),
}));

// ----------------------------------------------------------------------
// NEW: Meeting Invites (Reusable Links)
// ----------------------------------------------------------------------

export const meetingInvites = pgTable("meeting_invites", {
  // This 'id' is the unique token in the URL (e.g. /meetings/join?token=abc-123)
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),

  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),

  // The role this link grants (e.g., 'co_host')
  role: participantRole("role").notNull(),

  // When this link stops working
  expiresAt: timestamp("expires_at").notNull(),

  // Audit trail
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => ({
  // Index for fast lookups during "Get or Create" link generation
  meetingRoleIndex: index("meeting_role_idx").on(t.meetingId, t.role)
}));

export const sessionStatus = pgEnum("session_status", [
  "active",
  "completed",
  "abandoned",
  "processing"
]);

export const meetingSessions = pgTable("meeting_sessions", {
  id: text("id").primaryKey().$defaultFn(() => nanoid()),

  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),

  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),

  durationSeconds: text("duration_seconds"),

  status: sessionStatus("status").notNull().default("active"),

  transcript: jsonb("transcript")
    .$type<TranscriptItem[]>()
    .notNull()
    .default([]),

  summary: text("summary"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});
// -------------------------
// Tool calling
// ------------------------
export const actionStatus = pgEnum("action_status", [
  "proposed",      // LLM detected
  "pending",       // awaiting user confirmation
  "confirmed",     // user approved
  "rejected",      // user denied
  "executing",     // backend executing tool
  "completed",     // tool executed successfully
  "failed"         // tool execution failed
]);

export const actionType = pgEnum("action_type", [
  "send_email",
  "create_calendar_event",
  "create_jira_ticket",
  "create_github_issue",
  "post_slack_message"
]);

export const meetingActions = pgTable("meeting_actions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid()),

  meetingId: text("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" }),

  proposedByAgentId: text("agent_id")
    .notNull()
    .references(() => agents.id, { onDelete: "cascade" }),

  type: actionType("type").notNull(),

  // Structured tool payload
  payload: jsonb("payload").notNull(),

  // LLM confidence score
  confidence: text("confidence"),

  status: actionStatus("status")
    .notNull()
    .default("proposed"),

  // Which user confirmed or rejected
  resolvedByUserId: text("resolved_by_user_id")
    .references(() => user.id, { onDelete: "set null" }),

  // Tool execution response
  executionResult: jsonb("execution_result"),

  errorMessage: text("error_message"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  executedAt: timestamp("executed_at", { withTimezone: true })
}, (t) => ({
  meetingIdx: index("meeting_actions_meeting_idx").on(t.meetingId),
  statusIdx: index("meeting_actions_status_idx").on(t.status)
}));