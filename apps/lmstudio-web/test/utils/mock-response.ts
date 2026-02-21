/* eslint-disable @typescript-eslint/no-unused-vars */
import type { Response } from 'express';

/**
 * Minimal Express Response mock.
 *
 * We intentionally only implement the methods our controllers call.
 * This keeps controller unit tests strict without pulling in supertest.
 */
export function createMockResponse(): Response {
  const res = {
    setHeader: jest.fn(),
    send: jest.fn(),
    sendFile: jest.fn(),
    status: jest.fn(),
  } as unknown as Response;

  // status() is chainable in Express.
  (res.status as unknown as jest.Mock).mockImplementation((_code: number) => res);

  return res;
}
