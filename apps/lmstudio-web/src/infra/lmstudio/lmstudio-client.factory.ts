import { Injectable } from '@nestjs/common';
import { LMStudioClient } from '@lmstudio/sdk';

@Injectable()
export class LmStudioClientFactory {
  private readonly client = new LMStudioClient();
  getClient(): LMStudioClient {
    return this.client;
  }
}
