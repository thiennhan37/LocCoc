import { Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { chatDatabaseOptions } from '../config.js';

@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}
  async onApplicationShutdown() { if (this.db.isInitialized) await this.db.destroy(); }
}
@Module({
  providers: [{ provide: DataSource, inject: [ConfigService], useFactory: (config: ConfigService) => new DataSource(chatDatabaseOptions(config)).initialize() }, DatabaseShutdown],
  exports: [DataSource],
})
export class ChatDatabaseModule {}
