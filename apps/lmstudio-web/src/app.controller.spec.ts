import { Test } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  it('can be instantiated by Nest', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: {},
        },
      ],
    }).compile();

    const controller = moduleRef.get(AppController);
    expect(controller).toBeDefined();
  });
});
