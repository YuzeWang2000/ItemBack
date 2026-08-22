import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CreateItemDto } from './dto/create-item.dto';
import { CreateSpaceDto } from './dto/create-space.dto';
import { MoveItemDto } from './dto/move-item.dto';
import { UpdateNodeDto } from './dto/update-node.dto';
import { NodesService } from './nodes.service';

@ApiTags('nodes')
@ApiCookieAuth()
@Controller()
export class NodesController {
  constructor(private readonly nodes: NodesService) {}

  @Post('spaces')
  @ApiOperation({ summary: '创建顶级空间' })
  createSpace(@Body() dto: CreateSpaceDto) {
    return this.nodes.createSpace(dto);
  }

  @Get('spaces')
  listSpaces() {
    return this.nodes.listSpaces();
  }

  @Post('items')
  @ApiOperation({ summary: '在空间或容器中创建物品' })
  createItem(@Body() dto: CreateItemDto) {
    return this.nodes.createItem(dto);
  }

  @Get('nodes/tree')
  tree() {
    return this.nodes.tree();
  }

  @Get('nodes/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.nodes.get(id);
  }

  @Get('nodes/:id/children')
  children(@Param('id', ParseUUIDPipe) id: string) {
    return this.nodes.children(id);
  }

  @Get('nodes/:id/path')
  path(@Param('id', ParseUUIDPipe) id: string) {
    return this.nodes.path(id);
  }

  @Patch('nodes/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateNodeDto) {
    return this.nodes.update(id, dto);
  }

  @Delete('nodes/:id')
  archive(@Param('id', ParseUUIDPipe) id: string) {
    return this.nodes.archive(id);
  }

  @Post('nodes/:id/move')
  move(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MoveItemDto) {
    return this.nodes.move(id, dto);
  }

  @Get('nodes/:id/movements')
  movements(@Param('id', ParseUUIDPipe) id: string) {
    return this.nodes.movements(id);
  }

  @Get('search')
  @ApiQuery({ name: 'q', required: true })
  search(
    @Query('q') q = '',
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('pageSize', new ParseIntPipe({ optional: true })) pageSize = 20,
  ) {
    return this.nodes.search(q, page, pageSize);
  }
}
