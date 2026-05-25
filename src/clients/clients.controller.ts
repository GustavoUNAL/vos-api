import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ClientsService } from './clients.service';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

@UseGuards(JwtAuthGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('active') activeRaw?: string,
  ) {
    let active: boolean | undefined;
    if (activeRaw === 'true') active = true;
    else if (activeRaw === 'false') active = false;
    return this.clientsService.findAll({ search, active });
  }

  @Get('meta/next-code')
  nextCode() {
    return this.clientsService.nextCodePreview();
  }

  @Get(':idOrCode')
  findOne(@Param('idOrCode') idOrCode: string) {
    return this.clientsService.findOne(idOrCode);
  }

  @Post()
  create(@Body() dto: CreateClientDto) {
    return this.clientsService.create(dto);
  }

  @Patch(':idOrCode')
  update(@Param('idOrCode') idOrCode: string, @Body() dto: UpdateClientDto) {
    return this.clientsService.update(idOrCode, dto);
  }
}
