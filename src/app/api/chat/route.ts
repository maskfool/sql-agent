import { openai } from '@ai-sdk/openai';
import { streamText, UIMessage, convertToModelMessages, tool, stepCountIs } from 'ai';
import z from 'zod';
import { getClient } from '@/db/db';

// Allow streaming responses up to 30 seconds
export const maxDuration = 30;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const SYSTEM_PROMPT = `You are an expert SQL assistant that helps users to query their database using natural language.
  ${new Date().toLocaleString('sv-SE')}
  
  You have access to following tools:
  1. db tool - call this tool to query the database.
  2. schema tool - call this tool to get database schema information which will help you to write sql query.
  
  Rules:
  1. generate ONLY SELECT queries (no INSERT, UPDATE, DELETE, DROP)
  2. if the user asks for a query that is not related to the database, say that you are not able to help with that.
  3. Return valid SQLite syntax.
  4. Always use the schema information provided by the schema tool to write the sql query.
  5. For date comparisons that refer to "today" or local dates, prefer SQLite's 'localtime' modifier, e.g., DATE(sale_date, 'localtime') = DATE('now', 'localtime').
  
  Always respond in a helpful, conversational manner and tone while being technically accurate.`;

  const result = streamText({
    model: openai('gpt-4o'),
    messages: convertToModelMessages(messages),
    system: SYSTEM_PROMPT,
    stopWhen: stepCountIs(5),
    tools: {
        schema: tool({
            description: 'Call this tool to get database schema information.',
            inputSchema: z.object({}),
            execute: async () => {
                return `CREATE TABLE products (
id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
name text NOT NULL,
category text NOT NULL,
price real NOT NULL,
stock integer DEFAULT 0 NOT NULL,
created_at text DEFAULT CURRENT_TIMESTAMP
)

CREATE TABLE sales (
id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
product_id integer NOT NULL,
quantity integer NOT NULL,
total_amount real NOT NULL,
sale_date text DEFAULT CURRENT_TIMESTAMP,
customer_name text NOT NULL,
region text NOT NULL,
FOREIGN KEY (product_id) REFERENCES products(id) ON UPDATE no action ON DELETE no action
)`;
            },
        }),
        db: tool({
          description: 'Call this tool to query a database',
          inputSchema: z.object({
            query: z.string().describe('The SQL query to be ran'),
          }),
          execute: async ({ query }) => {
            try {
              console.log("Querying database with query: ", query);
              const safeQuery = validateAndPrepareQuery(query);
              const client = getClient();
              
              // Use client.execute for SELECT queries - returns { columns, rows, columnTypes }
              const result = await client.execute(safeQuery);
              
              return {
                success: true,
                columns: result.columns,
                rows: result.rows,
                columnTypes: result.columnTypes,
                rowsAffected: result.rowsAffected ?? 0,
                lastInsertRowid: result.lastInsertRowid ?? null,
              };
            } catch (error) {
              console.error("Database error: ", error);
              const errorMessage = error instanceof Error ? error.message : String(error);
              return {
                success: false,
                error: errorMessage,
                columns: [],
                rows: [],
                columnTypes: [],
                rowsAffected: 0,
                lastInsertRowid: null,
              };
            }
          },
        }),
      },
  });

  return result.toUIMessageStreamResponse();
}

// Basic read-only SQL guardrails for SQLite
function validateAndPrepareQuery(inputQuery: string): string {
  const query = inputQuery.trim();

  // Enforce single statement and disallow trailing semicolons
  if (query.includes(";")) {
    throw new Error("Only single, semicolon-free SELECT statements are allowed.");
  }

  const upper = query.toUpperCase();

  // Allow only SELECT/WITH
  if (!(upper.startsWith("SELECT") || upper.startsWith("WITH"))) {
    throw new Error("Only SELECT queries are permitted.");
  }

  // Block dangerous keywords/commands
  const forbidden = [
    "INSERT ",
    "UPDATE ",
    "DELETE ",
    "DROP ",
    "ALTER ",
    "CREATE ",
    "PRAGMA ",
    "ATTACH ",
    "DETACH ",
    "BEGIN ",
    "COMMIT ",
    "ROLLBACK ",
    "VACUUM ",
    "REINDEX ",
    "ANALYZE ",
    "TRIGGER ",
    "VIEW ",
  ];
  for (const keyword of forbidden) {
    if (upper.includes(keyword)) {
      throw new Error("Query contains forbidden operation.");
    }
  }

  // Basic identifier scope check: ensure queries reference only known tables if FROM/JOIN present
  const allowedTables = new Set(["PRODUCTS", "SALES"]);
  const tableRefs = [...query.matchAll(/\bFROM\s+([a-zA-Z_][\w]*)|\bJOIN\s+([a-zA-Z_][\w]*)/gi)];
  for (const match of tableRefs) {
    const tbl = (match[1] || match[2] || "").toUpperCase();
    if (tbl && !allowedTables.has(tbl)) {
      throw new Error(`Unknown or disallowed table referenced: ${tbl.toLowerCase()}`);
    }
  }

  // Add a LIMIT if missing to avoid huge scans
  const hasLimit = /\blimit\b/gi.test(query);
  if (!hasLimit) {
    return `${query} LIMIT 1000`;
  }
  return query;
}