import { EntityManager } from './EntityManager';
import { IDatabaseDriver } from './drivers/IDatabaseDriver';
import { NamingStrategy } from './naming-strategy/NamingStrategy';
import { MetadataStorage } from './metadata/MetadataStorage';
import { FileCacheAdapter } from './cache/FileCacheAdapter';
import { CacheAdapter } from './cache/CacheAdapter';
import { Logger } from './utils/Logger';
import { Utils } from './utils/Utils';
import { TypeScriptMetadataProvider } from './metadata/TypeScriptMetadataProvider';
import { MetadataProvider } from './metadata/MetadataProvider';
import { EntityRepository } from './EntityRepository';
import { EntityClass, IEntity } from './decorators/Entity';
import { NullCacheAdapter } from './cache/NullCacheAdapter';

const defaultOptions = {
  entitiesDirs: [],
  entitiesDirsTs: [],
  tsConfigPath: process.cwd() + '/tsconfig.json',
  autoFlush: true,
  strict: false,
  logger: () => undefined,
  baseDir: process.cwd(),
  entityRepository: EntityRepository,
  debug: false,
  cache: {
    enabled: true,
    adapter: FileCacheAdapter,
    options: { cacheDir: process.cwd() + '/temp' },
  },
  metadataProvider: TypeScriptMetadataProvider,
};

export class MikroORM {

  em: EntityManager;
  readonly options: MikroORMOptions;
  private readonly driver: IDatabaseDriver;
  private readonly logger: Logger;

  static async init(options: Options): Promise<MikroORM> {
    const orm = new MikroORM(options);
    const driver = await orm.connect();
    orm.em = new EntityManager(orm.options, driver);

    try {
      const storage = new MetadataStorage(orm.em, orm.options, orm.logger);
      storage.discover();

      return orm;
    } catch (e) {
      await orm.close(true);
      throw e;
    }
  }

  constructor(options: Options) {
    this.options = Utils.merge({}, defaultOptions, options);

    if (!this.options.dbName) {
      throw new Error('No database specified, please fill in `dbName` option');
    }

    if (!this.options.entitiesDirs || this.options.entitiesDirs.length === 0) {
      throw new Error('No directories for entity discovery specified, please fill in `entitiesDirs` option');
    }

    if (!this.options.driver) {
      this.options.driver = require('./drivers/MongoDriver').MongoDriver;
    }

    if (!this.options.cache.enabled) {
      this.options.cache.adapter = NullCacheAdapter;
    }

    this.logger = new Logger(this.options);
    this.driver = new this.options.driver!(this.options, this.logger);

    if (!this.options.clientUrl) {
      this.options.clientUrl = this.driver.getConnection().getDefaultClientUrl();
    }
  }

  async connect(): Promise<IDatabaseDriver> {
    await this.driver.getConnection().connect();
    const clientUrl = this.options.clientUrl!.replace(/\/\/([^:]+):(\w+)@/, '//$1:*****@');
    this.logger.info(`MikroORM: successfully connected to database ${this.options.dbName}${clientUrl ? ' on ' + clientUrl : ''}`);

    return this.driver;
  }

  async isConnected(): Promise<boolean> {
    return this.driver.getConnection().isConnected();
  }

  async close(force = false): Promise<void> {
    return this.driver.getConnection().close(force);
  }

}

export interface MikroORMOptions {
  dbName: string;
  entitiesDirs: string[];
  entitiesDirsTs: string[];
  tsConfigPath: string;
  autoFlush: boolean;
  driver?: { new (options: MikroORMOptions, logger: Logger): IDatabaseDriver };
  namingStrategy?: { new (): NamingStrategy };
  entityRepository: { new (em: EntityManager, entityName: string | EntityClass<IEntity>): EntityRepository<IEntity> };
  clientUrl?: string;
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  multipleStatements?: boolean; // for mysql driver
  strict: boolean;
  logger: (message: string) => void;
  debug: boolean;
  baseDir: string;
  cache: {
    enabled: boolean,
    adapter: { new (...params: any[]): CacheAdapter },
    options: { [k: string]: any },
  },
  metadataProvider: { new (options: MikroORMOptions): MetadataProvider },
}

export type Options = Pick<MikroORMOptions, Exclude<keyof MikroORMOptions, keyof typeof defaultOptions>> | MikroORMOptions;
