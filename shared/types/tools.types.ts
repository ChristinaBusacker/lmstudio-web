import { JsonObject } from './json.types';

export type ToolDef = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: JsonObject;
  };
};

export type ToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};
