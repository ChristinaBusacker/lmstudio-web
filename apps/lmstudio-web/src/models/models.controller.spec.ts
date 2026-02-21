import { Test } from '@nestjs/testing';
import { ModelsController } from './models.controller';
import { ModelsService } from './models.service';
import type {
  LoadedModelInstanceDto,
  LoadModelResponseDto,
  ModelDetailsDto,
  ModelListItemDto,
  UnloadModelResponseDto,
} from './dto/model.dto';

type ModelsServiceMock = Pick<
  ModelsService,
  'listModels' | 'listLoaded' | 'getModel' | 'loadModel' | 'unloadModel'
>;

describe('ModelsController', () => {
  let controller: ModelsController;
  let models: jest.Mocked<ModelsServiceMock>;

  beforeEach(async () => {
    models = {
      listModels: jest.fn(),
      listLoaded: jest.fn(),
      getModel: jest.fn(),
      loadModel: jest.fn(),
      unloadModel: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ModelsController],
      providers: [{ provide: ModelsService, useValue: models }],
    }).compile();

    controller = moduleRef.get(ModelsController);
  });

  it('list() delegates to ModelsService', async () => {
    const list: ModelListItemDto[] = [
      { id: 'm1', publisher: 'Model', state: 'unknown' } as ModelListItemDto,
    ];
    models.listModels.mockResolvedValue(list);
    await expect(controller.list()).resolves.toBe(list);
    expect(models.listModels).toHaveBeenCalledTimes(1);
  });

  it('loaded() delegates to ModelsService', async () => {
    const loaded: LoadedModelInstanceDto[] = [
      { id: 'i1', modelId: 'm1' } as LoadedModelInstanceDto,
    ];
    models.listLoaded.mockResolvedValue(loaded);
    await expect(controller.loaded()).resolves.toBe(loaded);
    expect(models.listLoaded).toHaveBeenCalledTimes(1);
  });

  it('get() delegates to ModelsService', async () => {
    const details: ModelDetailsDto = { id: 'm1', state: 'unknown' } as ModelDetailsDto;
    models.getModel.mockResolvedValue(details);
    await expect(controller.get('m1')).resolves.toBe(details);
    expect(models.getModel).toHaveBeenCalledWith('m1');
  });

  it('load() delegates to ModelsService with id and dto', async () => {
    const resp: LoadModelResponseDto = { state: 'loaded' } as LoadModelResponseDto;
    models.loadModel.mockResolvedValue(resp);

    const dto = { forceNewInstance: true };

    await expect(controller.load('m1', dto)).resolves.toBe(resp);
    expect(models.loadModel).toHaveBeenCalledWith('m1', dto);
  });

  it('unload() delegates to ModelsService with id and dto', async () => {
    const resp: UnloadModelResponseDto = { state: 'not-loaded' } as UnloadModelResponseDto;
    models.unloadModel.mockResolvedValue(resp);

    const dto = { identifier: 'i1' };

    await expect(controller.unload('m1', dto)).resolves.toBe(resp);
    expect(models.unloadModel).toHaveBeenCalledWith('m1', dto);
  });
});
