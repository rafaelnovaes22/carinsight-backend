import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { CatalogModule } from '../catalog/catalog.module';
import { DecisionBriefing } from './decision-briefing';
import { DecisionController } from './decision.controller';
import { DECISION_POLICY, decisionPolicy } from './decision-policy';

@Module({
  imports: [AiModule, CatalogModule],
  controllers: [DecisionController],
  providers: [
    DecisionBriefing,
    { provide: DECISION_POLICY, useFactory: decisionPolicy },
  ],
  exports: [DecisionBriefing],
})
export class DecisionModule {}
