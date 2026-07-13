import { Module } from '@nestjs/common';
import { defaultMcpRateLimiter } from '@growthos/firebase-orm-models';
import { McpController } from './mcp.controller';
import { MCP_RATE_LIMITER } from './mcp-auth.guard';

@Module({
  controllers: [McpController],
  providers: [{ provide: MCP_RATE_LIMITER, useValue: defaultMcpRateLimiter }],
})
export class McpModule {}
