import { Module } from '@nestjs/common';
import { McpOAuthController } from './mcp-oauth.controller';

@Module({
  controllers: [McpOAuthController],
})
export class McpOAuthModule {}
