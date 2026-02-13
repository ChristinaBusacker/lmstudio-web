import { join } from 'path';
import 'reflect-metadata';
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'sqlite',
  database: process.env.DB_PATH ?? join(process.cwd(), 'data', 'app.sqlite'),
  synchronize: false,
  migrationsRun: true,

  entities: [__dirname + '/**/*.entity.{ts,js}'],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
});
