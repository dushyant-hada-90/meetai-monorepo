import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless'; // Note: neon-serverless

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool); // This driver SUPPORTS transactions