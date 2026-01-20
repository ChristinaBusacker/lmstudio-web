import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ModelsService } from './models.service';
import {
  ModelListItemDto,
  LoadedModelInstanceDto,
  ModelDetailsDto,
  LoadModelResponseDto,
  LoadModelDto,
  UnloadModelResponseDto,
  UnloadModelDto,
} from './dto/model.dto';

@ApiTags('Models')
@Controller('models')
export class ModelsController {
  constructor(private readonly models: ModelsService) {}

  @Get()
  @ApiOperation({
    summary: 'List models from LM Studio (includes load state)',
    description:
      'Uses LM Studio REST API v0 GET /api/v0/models to return downloaded + loaded models and their state.',
  })
  @ApiOkResponse({ type: [ModelListItemDto] })
  list(): Promise<ModelListItemDto[]> {
    return this.models.listModels();
  }

  @Get('loaded')
  @ApiOperation({
    summary: 'List currently loaded model instances',
    description: 'Uses LM Studio SDK listLoaded() to show what is currently in memory.',
  })
  @ApiOkResponse({ type: [LoadedModelInstanceDto] })
  loaded(): Promise<LoadedModelInstanceDto[]> {
    return this.models.listLoaded();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get model details from LM Studio' })
  @ApiParam({ name: 'id', description: 'LM Studio model id / key' })
  @ApiOkResponse({ type: ModelDetailsDto })
  get(@Param('id') id: string): Promise<ModelDetailsDto> {
    return this.models.getModel(id);
  }

  @Post(':id/load')
  @ApiOperation({
    summary: 'Load / preload a model into memory',
    description:
      'Uses LM Studio SDK. Default behavior ensures the model is loaded (load if needed). ' +
      'With forceNewInstance=true, always loads a new instance.',
  })
  @ApiParam({ name: 'id', description: 'LM Studio model id / key' })
  @ApiOkResponse({ type: LoadModelResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid payload or LM Studio refused to load the model' })
  load(@Param('id') id: string, @Body() dto: LoadModelDto): Promise<LoadModelResponseDto> {
    return this.models.loadModel(id, dto);
  }

  @Post(':id/unload')
  @ApiOperation({
    summary: 'Unload / eject a model from memory',
    description:
      'Uses LM Studio SDK to unload a model instance. If not loaded, returns state=not-loaded.',
  })
  @ApiParam({ name: 'id', description: 'LM Studio model id / key' })
  @ApiOkResponse({ type: UnloadModelResponseDto })
  unload(@Param('id') id: string, @Body() dto: UnloadModelDto): Promise<UnloadModelResponseDto> {
    return this.models.unloadModel(id, dto);
  }
}
