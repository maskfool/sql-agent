'use client';

import { useChat } from '@ai-sdk/react';
import { useState } from 'react';

type ToolDbPart = {
  type: 'tool-db';
  input?: { query?: string };
  output?: {
    success?: boolean;
    columns?: string[];
    rows?: unknown[][];
    columnTypes?: string[];
    error?: string;
  };
  state?: string;
};

export default function Chat() {
  const [input, setInput] = useState('');
  const { messages, sendMessage } = useChat();
  type AnyPart = { type?: string };
  const showProcessing = Boolean(
    messages.length && (messages[messages.length - 1] as { parts?: AnyPart[] }).parts?.some((p) => p.type === 'step-start')
  );

  // Check if any tool is being used
  const hasActiveTool = (message: typeof messages[0]) => {
    return message.parts?.some((p: AnyPart) => p.type === 'tool-db' || p.type === 'tool-schema');
  };

  // Extract table data from tool-db output
  const getTableData = (message: typeof messages[0]) => {
    const dbPart = message.parts?.find((p: AnyPart) => p.type === 'tool-db') as ToolDbPart | undefined;
    if (dbPart?.output?.success && dbPart.output.columns && dbPart.output.rows) {
      const columns = dbPart.output.columns;
      // Convert rows to arrays - handle both object and array formats
      const rows = dbPart.output.rows.map((row: unknown) => {
        // If row is already an array, use it
        if (Array.isArray(row)) {
          return row;
        }
        // If row is an object, convert to array based on column order
        if (row && typeof row === 'object') {
          return columns.map(col => (row as Record<string, unknown>)[col]);
        }
        return [];
      });
      
      return {
        columns,
        rows,
      };
    }
    return null;
  };

  // Remove markdown tables from text when we have a formatted table
  const cleanTextFromTables = (text: string, hasTable: boolean) => {
    if (!hasTable) return text;
    
    // Remove all data listing formats when we have a formatted table
    const lines = text.split('\n');
    const cleanedLines: string[] = [];
    let inDataSection = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      
      // Check for markdown table lines
      const isMarkdownTableLine = trimmed.startsWith('|') && trimmed.includes('|');
      const isTableSeparator = /^\|[\s\-:|]+\|$/.test(trimmed);
      
      // Check for tab-separated table (has multiple tabs and looks like data)
      const hasMultipleTabs = (trimmed.match(/\t/g) || []).length >= 2;
      const looksLikeDataRow = hasMultipleTabs && trimmed.length > 10;
      
      // Check if it's a header row (contains common table headers)
      const isHeaderRow = /^(id|name|product|quantity|total|sale|customer|region)/i.test(trimmed) && 
                          (hasMultipleTabs || isMarkdownTableLine);
      
      // Check for key-value pair entries (Entry X: ID: Y, Product ID: Z, etc.)
      const isKeyValueEntry = /^Entry\s+\d+:/i.test(trimmed) || 
                              (/^(ID|Product ID|Quantity|Total Amount|Sale Date|Customer|Region):/i.test(trimmed) && 
                               trimmed.includes(',') && 
                               (trimmed.includes('ID:') || trimmed.includes('Product ID:')));
      
      // Check for bullet/list entries with database fields
      const isDataListEntry = /^[\*\-\•]\s*(ID|Product|Quantity|Total|Sale|Customer|Region):/i.test(trimmed);
      
      // Check for numbered entries with database data
      const isNumberedDataEntry = /^\d+\.\s*(ID|Product ID|Quantity|Total Amount|Sale Date|Customer|Region):/i.test(trimmed);
      
      // Check if line contains multiple database field patterns
      const hasMultipleDbFields = (trimmed.match(/(ID|Product ID|Quantity|Total Amount|Sale Date|Customer|Region):/gi) || []).length >= 3;
      
      if (isMarkdownTableLine || isTableSeparator || (looksLikeDataRow && hasMultipleTabs) || isHeaderRow || 
          isKeyValueEntry || isDataListEntry || isNumberedDataEntry || hasMultipleDbFields) {
        inDataSection = true;
        continue;
      }
      
      // If we were in a data section and now we're not, stop skipping
      if (inDataSection && !isMarkdownTableLine && !looksLikeDataRow && !isKeyValueEntry && !isDataListEntry && !isNumberedDataEntry && !hasMultipleDbFields) {
        // Check if this line is just a closing phrase
        const isClosingPhrase = /^(Let me know|If you need|Need anything else|Anything else)/i.test(trimmed);
        if (isClosingPhrase) {
          inDataSection = false;
          continue; // Skip closing phrases too
        }
        inDataSection = false;
      }
      
      if (!inDataSection) {
        cleanedLines.push(line);
      }
    }
    
    // Also remove common table-related phrases and data listings
    let cleaned = cleanedLines.join('\n');
    cleaned = cleaned.replace(/^Here's the list of[^\n]*:\n*/gim, '');
    cleaned = cleaned.replace(/^(Here are|Here is|The list of|The sales)[^\n]*:\n*/gim, '');
    cleaned = cleaned.replace(/^If you need more information[^\n]*\n*/gim, '');
    cleaned = cleaned.replace(/^Let me know if you need anything else[^\n]*\n*/gim, '');
    cleaned = cleaned.replace(/\d+\s+rows?\s*$/gim, '');
    cleaned = cleaned.replace(/^\s*\n/gm, ''); // Remove empty lines
    
    return cleaned.trim();
  };

  return (
    <div className="flex flex-col w-full max-w-2xl py-24 mx-auto stretch px-4">
      {messages.length === 0 && (
        <div className="text-center mb-8 mt-12">
          <div className="text-6xl mb-4">🤖</div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-2">
            SQL Assistant
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Ask me anything about your database!
          </p>
        </div>
      )}

      {messages.map(message => {
        const hasTool = hasActiveTool(message);
        const tableData = getTableData(message);
        return (
          <div key={message.id} className={`mb-6 flex items-start gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`shrink-0 mt-1 text-3xl ${message.role === 'user' ? 'order-2' : ''}`}>
              {message.role === 'user' ? '💁🏻' : '🤖'}
            </div>
            <div className={`flex-1 ${
              message.role === 'user'
                ? 'bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 shadow-lg'
                : 'bg-white dark:bg-zinc-800 text-gray-900 dark:text-gray-100 rounded-2xl rounded-tl-sm px-4 py-3 shadow-md border border-gray-200 dark:border-zinc-700'
            }`}>
              {message.parts.map((part, i) => {
                switch (part.type) {
                  case 'text':
                    // Clean text from markdown tables if we have a formatted table
                    const cleanedText = cleanTextFromTables(part.text, !!tableData);
                    // Only show text if it's not empty after cleaning
                    if (!cleanedText.trim()) {
                      return null;
                    }
                    return (
                      <div key={`${message.id}-${i}`} className="whitespace-pre-wrap leading-relaxed">
                        {cleanedText}
                      </div>
                    );
                  case 'tool-db':
                  case 'tool-schema':
                    // Hide tool displays - they work in background
                    return null;
                  case 'step-start':
                    return null;
                  case 'reasoning':
                    return null;
                  default:
                    return null;
                }
              })}
              
              {/* Display table if we have query results */}
              {tableData && tableData.rows.length > 0 && (
                <div className="mt-4 overflow-x-auto">
                  <div className="inline-block min-w-full align-middle">
                    <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 rounded-lg">
                      <table className="min-w-full divide-y divide-gray-300 dark:divide-zinc-700">
                        <thead className="bg-gray-50 dark:bg-zinc-900">
                          <tr>
                            {tableData.columns.map((column, idx) => (
                              <th
                                key={idx}
                                scope="col"
                                className="px-4 py-3 text-left text-xs font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider"
                              >
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-zinc-800 divide-y divide-gray-200 dark:divide-zinc-700">
                          {tableData.rows.map((row, rowIdx) => {
                            // Ensure row is an array
                            const rowArray = Array.isArray(row) ? row : [];
                            return (
                              <tr
                                key={rowIdx}
                                className="hover:bg-gray-50 dark:hover:bg-zinc-700/50 transition-colors"
                              >
                                {rowArray.map((cell, cellIdx) => (
                                  <td
                                    key={cellIdx}
                                    className="px-4 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100"
                                  >
                                    {cell === null || cell === undefined ? (
                                      <span className="text-gray-400 dark:text-gray-500 italic">null</span>
                                    ) : (
                                      String(cell)
                                    )}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 text-right">
                      {tableData.rows.length} {tableData.rows.length === 1 ? 'row' : 'rows'}
                    </div>
                  </div>
                </div>
              )}
              
              {hasTool && !tableData && (
                <div className="mt-2 pt-2 border-t border-gray-200 dark:border-zinc-700 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Querying database...</span>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {showProcessing && (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mb-4 animate-pulse">
          <div className="flex gap-1">
            <span className="inline-block h-2 w-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.3s]"></span>
            <span className="inline-block h-2 w-2 rounded-full bg-indigo-500 animate-bounce [animation-delay:-0.15s]"></span>
            <span className="inline-block h-2 w-2 rounded-full bg-indigo-500 animate-bounce"></span>
          </div>
          <span className="ml-2">Thinking...</span>
        </div>
      )}

      <form
        onSubmit={e => {
          e.preventDefault();
          if (input.trim()) {
            sendMessage({ text: input });
            setInput('');
          }
        }}
        className="sticky bottom-0 bg-white dark:bg-zinc-900 pb-4 pt-4"
      >
        <div className="relative">
          <input
            className="w-full p-4 pr-12 border-2 border-gray-300 dark:border-zinc-700 rounded-2xl shadow-lg focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 dark:bg-zinc-800 dark:text-white transition-colors"
            value={input}
            placeholder="Ask about your database..."
            onChange={e => setInput(e.currentTarget.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (input.trim()) {
                  sendMessage({ text: input });
                  setInput('');
                }
              }
            }}
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
            aria-label="Send message"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}