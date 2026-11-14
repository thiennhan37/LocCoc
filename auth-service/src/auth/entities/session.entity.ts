import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'sessions' })
@Index('IDX_sessions_user_id', ['userId'])
@Index('UQ_sessions_refresh_token_hash', ['refreshTokenHash'], { unique: true })
@Index('IDX_sessions_expires_at', ['expiresAt'])
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'refresh_token_hash', type: 'char', length: 64 })
  refreshTokenHash!: string;

  @Column({ name: 'device_info', type: 'jsonb', nullable: true })
  deviceInfo!: { userAgent?: string; platform?: string } | null;

  @Column({ type: 'inet', nullable: true })
  ip!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'last_used_at', type: 'timestamptz' })
  lastUsedAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;
}