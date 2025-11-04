'use client';

import { useChat } from '@ai-sdk/react';
import { useState } from 'react';

type ToolDbPart = {
  type: 'tool-db';
  input?: { query?: string };
  output?: { rows?: unknown[] };
  state?: string;
};

export default function Chat() {
  const [input, setInput] = useState('');
  const { messages, sendMessage } = useChat();
  type AnyPart = { type?: string };
  const showProcessing = Boolean(
    messages.length && (messages[messages.length - 1] as { parts?: AnyPart[] }).parts?.some((p) => p.type === 'step-start')
  );
  return (
    <div className="flex flex-col w-full max-w-md py-24 mx-auto stretch">
      {messages.map(message => (
        <div key={message.id} className="mb-4 flex items-start gap-3">
          <div className="shrink-0 mt-1 text-3xl">
            {message.role === 'user' ? '💁🏻' : '🤖'}
          </div>
          <div className={
            message.role === 'user'
              ? 'whitespace-pre-wrap bg-indigo-100 text-indigo-900 rounded-2xl px-3 py-2'
              : 'whitespace-pre-wrap bg-zinc-100 dark:bg-zinc-800 rounded-2xl px-3 py-2'
          }>
          {message.parts.map((part, i) => {
            switch (part.type) {
              case 'text':
                return <div key={`${message.id}-${i}`}>{part.text}</div>;
              case 'tool-db': {
                const dbPart = part as unknown as ToolDbPart;
                return (
                  <div
                                        key={`${message.id}-${i}`}
                                        className="my-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                                        <div className="font-semibold text-blue-700 dark:text-blue-300 mb-1">
                                            🔍 Database Query
                                        </div>

                                        {dbPart.input?.query && (
                                            <pre className="text-xs bg-white dark:bg-zinc-900 p-2 rounded mb-2 overflow-x-auto">
                                                {dbPart.input?.query}
                                            </pre>
                                        )}
                                        {part.state === 'output-available' &&
                                            (dbPart.output) && (
                                                <div className="text-sm text-green-700 dark:text-green-300">
                                                    ✅ Returned
                                                    {dbPart.output?.rows
                                                        ?.length || 0}{' '}
                                                    rows
                                                </div>
                                            )}
                                    </div>
                  
                );
              }
                case 'tool-schema':
                  return (
                  <div
                  key={`${message.id}-${i}`}
                  className="my-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded border border-purple-200 dark:border-purple-800">
                  <div className="font-semibold text-purple-700 dark:text-purple-300">
                      📋 Schema Tool
                  </div>
                  {part.state === 'output-available' && (
                      <div className="text-sm text-green-700 dark:text-green-300 py-2">
                          ✅ Schema loaded
                      </div>
                  )}
              </div>
          );

      case 'step-start':
          return null;

      case 'reasoning':
          // Optional: show reasoning
          return null;

      default:
          return null;
            }
          })}
          </div>
        </div>
      ))}

      {showProcessing && (
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 my-2">
          <span className="inline-block h-2 w-2 rounded-full bg-gray-400 animate-pulse"></span>
          <span className="inline-block h-2 w-2 rounded-full bg-gray-400 animate-pulse [animation-delay:150ms]"></span>
          <span className="inline-block h-2 w-2 rounded-full bg-gray-400 animate-pulse [animation-delay:300ms]"></span>
          <span>Processing…</span>
        </div>
      )}

      <form
        onSubmit={e => {
          e.preventDefault();
          sendMessage({ text: input });
          setInput('');
        }}
      >
        <input
          className="fixed dark:bg-zinc-900 bottom-0 w-full max-w-md p-2 mb-8 border border-zinc-300 dark:border-zinc-800 rounded shadow-xl"
          value={input}
          placeholder="Say something..."
          onChange={e => setInput(e.currentTarget.value)}
        />
      </form>
    </div>
  );
}