import { Controller, Get } from '@nestjs/common';

export type LiveHealth = Readonly<{
  status: 'ok';
}>;

@Controller('health')
export class AppController {
  @Get('live')
  getLiveHealth(): LiveHealth {
    return { status: 'ok' };
  }
}
