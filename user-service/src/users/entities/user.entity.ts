import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'users' })
@Index('IDX_users_email', ['email'])
export class User {
  /** Account ID issued by auth-service/IAM. Acts as primary key in user-service. */
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 30, nullable: true, unique: true })
  username!: string | null;

  @Column({
    name: 'account_status',
    type: 'varchar',
    length: 32,
    default: 'pending_verification',
  })
  accountStatus!: string;

  @Column({ name: 'account_version', type: 'bigint', default: 0 })
  accountVersion!: string;

  @Column({ type: 'varchar', length: 320, unique: true })
  email!: string;

  @Column({
    name: 'display_name',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  displayName!: string | null;

  @Column({
    name: 'last_display_name_changed_at',
    type: 'timestamptz',
    nullable: true,
  })
  lastDisplayNameChangedAt: Date | null = null;

  @Column({ name: 'avatar_url', type: 'varchar', length: 1024, nullable: true })
  avatarUrl!: string | null;

  @Column({ name: 'cover_url', type: 'varchar', length: 1024, nullable: true })
  coverUrl!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
