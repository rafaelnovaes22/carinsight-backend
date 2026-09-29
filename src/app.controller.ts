import { Controller, Get, Redirect, Header } from '@nestjs/common';
import { AppService } from './app.service';
import { frontendOrigin } from './runtime-config';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Redirect()
  getHello(): { url: string; statusCode: number } {
    return { url: frontendOrigin(), statusCode: 302 };
  }

  @Get('health')
  @Header('Cache-Control', 'no-store')
  health(): Promise<{ status: string }> {
    return this.appService.health();
  }
}
