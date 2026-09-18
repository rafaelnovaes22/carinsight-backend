import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { DecisionBriefing } from './decision-briefing';
import type { DecisionBriefReply } from './decision-briefing';
import { DecisionRequestDto } from './decision-request.dto';
import { AiThrottle } from '../common/decorators/throttle.decorator';

@Controller('decision')
export class DecisionController {
  constructor(private readonly briefing: DecisionBriefing) {}

  @Post('brief')
  @AiThrottle()
  @HttpCode(200)
  create(@Body() request: DecisionRequestDto): Promise<DecisionBriefReply> {
    return this.briefing.create(request);
  }
}
