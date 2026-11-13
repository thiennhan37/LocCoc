import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Account } from './account.entity.js';

export type SocialProvider = 'google' | 'apple';

@Entity({ name: 'identities' })
@Index('IDX_identities_user_id', ['userId'])
export class Identity {
  @PrimaryColumn({ type: 'varchar', length: 16 })
  provider!: SocialProvider;

  @PrimaryColumn({ name: 'provider_user_id', type: 'varchar', length: 255 })
  providerUserId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => Account, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  account!: Account;

  @Column({ type: 'varchar', length: 320, nullable: true })
  email!: string | null;

  @Column({ name: 'display_name', type: 'varchar', length: 200, nullable: true })
  displayName!: string | null;

  @Column({ name: 'is_private_email', type: 'boolean', default: false })
  isPrivateEmail!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
