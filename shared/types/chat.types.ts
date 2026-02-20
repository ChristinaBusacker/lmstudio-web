import { JsonObject } from './json.types';

export type ChatCompletionToolCallDelta = {
  index?: number;
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

export type ChatCompletionChunk = {
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: ChatCompletionToolCallDelta[];
    };
  }>;
  usage?: Record<string, unknown>;
};

export type ChatCompletionMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
};

export type ChatRequestMessage =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }>;
    }
  | { role: 'tool'; content: string; tool_call_id: string };

export interface StreamResult {
  content: string;
  stats?: JsonObject;
}
