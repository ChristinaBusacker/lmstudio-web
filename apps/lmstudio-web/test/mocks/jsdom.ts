/* eslint-disable @typescript-eslint/no-unused-vars */
type MinimalWindow = {
  document: unknown;
};

export class JSDOM {
  public window: MinimalWindow;

  public constructor(_html?: string) {
    this.window = { document: {} };
  }
}
