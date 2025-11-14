CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`provider` text NOT NULL,
	`provider_account_id` text NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`refresh_token_expires_in` integer,
	`expires_at` integer,
	`token_type` text,
	`scope` text,
	`id_token` text,
	`session_state` text,
	`oauth_token_secret` text,
	`oauth_token` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_provider_provider_account_id_index` ON `accounts` (`provider`,`provider_account_id`);--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`key_type` integer DEFAULT 1 NOT NULL,
	`identifier` text(16) NOT NULL,
	`token` text NOT NULL,
	`allowed_ips` text,
	`memo` text,
	`last_used_at` integer,
	`expires_at` integer,
	`r_servers` integer DEFAULT 0 NOT NULL,
	`r_nodes` integer DEFAULT 0 NOT NULL,
	`r_allocations` integer DEFAULT 0 NOT NULL,
	`r_users` integer DEFAULT 0 NOT NULL,
	`r_locations` integer DEFAULT 0 NOT NULL,
	`r_nests` integer DEFAULT 0 NOT NULL,
	`r_eggs` integer DEFAULT 0 NOT NULL,
	`r_database_hosts` integer DEFAULT 0 NOT NULL,
	`r_server_databases` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_identifier_unique` ON `api_keys` (`identifier`);--> statement-breakpoint
CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`occurred_at` integer NOT NULL,
	`actor` text NOT NULL,
	`actor_type` text NOT NULL,
	`action` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text,
	`metadata` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `audit_events_occurred_id` ON `audit_events` (`occurred_at`,`id`);--> statement-breakpoint
CREATE TABLE `database_hosts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`hostname` text NOT NULL,
	`port` integer DEFAULT 3306 NOT NULL,
	`username` text,
	`password` text,
	`database` text,
	`node_id` text,
	`max_databases` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `wings_nodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `egg_variables` (
	`id` text PRIMARY KEY NOT NULL,
	`egg_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`env_variable` text NOT NULL,
	`default_value` text,
	`user_viewable` integer DEFAULT true NOT NULL,
	`user_editable` integer DEFAULT true NOT NULL,
	`rules` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`egg_id`) REFERENCES `eggs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `eggs` (
	`id` text PRIMARY KEY NOT NULL,
	`uuid` text NOT NULL,
	`nest_id` text NOT NULL,
	`author` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`docker_image` text NOT NULL,
	`docker_images` text,
	`startup` text NOT NULL,
	`config_files` text,
	`config_startup` text,
	`config_stop` text,
	`config_logs` text,
	`script_container` text,
	`script_entry` text,
	`script_install` text,
	`copy_script_from` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`nest_id`) REFERENCES `nests`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `eggs_uuid_unique` ON `eggs` (`uuid`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`short` text NOT NULL,
	`long` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `locations_short_unique` ON `locations` (`short`);--> statement-breakpoint
CREATE TABLE `mount_egg` (
	`mount_id` text NOT NULL,
	`egg_id` text NOT NULL,
	PRIMARY KEY(`mount_id`, `egg_id`),
	FOREIGN KEY (`mount_id`) REFERENCES `mounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`egg_id`) REFERENCES `eggs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mount_node` (
	`mount_id` text NOT NULL,
	`node_id` text NOT NULL,
	PRIMARY KEY(`mount_id`, `node_id`),
	FOREIGN KEY (`mount_id`) REFERENCES `mounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`node_id`) REFERENCES `wings_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mount_server` (
	`mount_id` text NOT NULL,
	`server_id` text NOT NULL,
	PRIMARY KEY(`mount_id`, `server_id`),
	FOREIGN KEY (`mount_id`) REFERENCES `mounts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `mounts` (
	`id` text PRIMARY KEY NOT NULL,
	`uuid` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`source` text NOT NULL,
	`target` text NOT NULL,
	`read_only` integer DEFAULT false NOT NULL,
	`user_mountable` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mounts_uuid_unique` ON `mounts` (`uuid`);--> statement-breakpoint
CREATE TABLE `nests` (
	`id` text PRIMARY KEY NOT NULL,
	`uuid` text NOT NULL,
	`author` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `nests_uuid_unique` ON `nests` (`uuid`);--> statement-breakpoint
CREATE TABLE `recovery_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `server_allocations` (
	`id` text PRIMARY KEY NOT NULL,
	`node_id` text NOT NULL,
	`server_id` text,
	`ip` text NOT NULL,
	`port` integer NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`ip_alias` text,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`node_id`) REFERENCES `wings_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `server_allocations_unique` ON `server_allocations` (`node_id`,`ip`,`port`);--> statement-breakpoint
CREATE TABLE `server_backups` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`uuid` text NOT NULL,
	`name` text NOT NULL,
	`ignored_files` text,
	`disk` text DEFAULT 'wings' NOT NULL,
	`checksum` text,
	`bytes` integer DEFAULT 0 NOT NULL,
	`is_successful` integer DEFAULT false NOT NULL,
	`is_locked` integer DEFAULT false NOT NULL,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `server_backups_uuid_unique` ON `server_backups` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `server_backups_server_id_index` ON `server_backups` (`server_id`);--> statement-breakpoint
CREATE TABLE `server_databases` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`database_host_id` text NOT NULL,
	`name` text NOT NULL,
	`username` text NOT NULL,
	`password` text NOT NULL,
	`remote` text NOT NULL,
	`max_connections` integer,
	`status` text DEFAULT 'ready' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`database_host_id`) REFERENCES `database_hosts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `server_databases_unique_name_per_server` ON `server_databases` (`server_id`,`name`);--> statement-breakpoint
CREATE TABLE `server_startup_env` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`description` text,
	`is_editable` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `server_env_key_unique` ON `server_startup_env` (`server_id`,`key`);--> statement-breakpoint
CREATE TABLE `server_limits` (
	`server_id` text NOT NULL,
	`cpu` integer,
	`memory` integer,
	`disk` integer,
	`swap` integer,
	`io` integer,
	`threads` text,
	`oom_disabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `server_schedule_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`schedule_id` text NOT NULL,
	`sequence_id` integer NOT NULL,
	`action` text NOT NULL,
	`payload` text,
	`time_offset` integer DEFAULT 0 NOT NULL,
	`continue_on_failure` integer DEFAULT false NOT NULL,
	`is_queued` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`schedule_id`) REFERENCES `server_schedules`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `server_schedule_tasks_sequence` ON `server_schedule_tasks` (`schedule_id`,`sequence_id`);--> statement-breakpoint
CREATE TABLE `server_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`name` text NOT NULL,
	`cron` text NOT NULL,
	`action` text NOT NULL,
	`next_run_at` integer,
	`last_run_at` integer,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `server_subusers` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`user_id` text NOT NULL,
	`permissions` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `server_subusers_unique_user_per_server` ON `server_subusers` (`server_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `server_transfers` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`old_node` text NOT NULL,
	`new_node` text NOT NULL,
	`old_allocation` text NOT NULL,
	`new_allocation` text NOT NULL,
	`old_additional_allocations` text,
	`new_additional_allocations` text,
	`successful` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `servers` (
	`id` text PRIMARY KEY NOT NULL,
	`uuid` text NOT NULL,
	`identifier` text NOT NULL,
	`external_id` text,
	`name` text NOT NULL,
	`description` text,
	`status` text,
	`suspended` integer DEFAULT false NOT NULL,
	`skip_scripts` integer DEFAULT false NOT NULL,
	`owner_id` text,
	`node_id` text,
	`allocation_id` text,
	`nest_id` text,
	`egg_id` text,
	`startup` text,
	`image` text,
	`docker_image` text,
	`allocation_limit` integer,
	`database_limit` integer,
	`backup_limit` integer DEFAULT 0 NOT NULL,
	`installed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`node_id`) REFERENCES `wings_nodes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`allocation_id`) REFERENCES `server_allocations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`nest_id`) REFERENCES `nests`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`egg_id`) REFERENCES `eggs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `servers_uuid_unique` ON `servers` (`uuid`);--> statement-breakpoint
CREATE UNIQUE INDEX `servers_identifier_unique` ON `servers` (`identifier`);--> statement-breakpoint
CREATE UNIQUE INDEX `servers_external_id_unique` ON `servers` (`external_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`session_token` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`email` text NOT NULL,
	`password` text NOT NULL,
	`name_first` text,
	`name_last` text,
	`language` text DEFAULT 'en' NOT NULL,
	`root_admin` integer DEFAULT false NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`email_verified` integer,
	`image` text,
	`use_totp` integer DEFAULT false NOT NULL,
	`totp_secret` text,
	`totp_authenticated_at` integer,
	`remember_token` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verification_tokens` (
	`identifier` text NOT NULL,
	`token` text NOT NULL,
	`expires` integer NOT NULL,
	PRIMARY KEY(`identifier`, `token`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `verification_token_identifier_token_index` ON `verification_tokens` (`identifier`,`token`);--> statement-breakpoint
CREATE TABLE `wings_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`uuid` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`base_url` text NOT NULL,
	`fqdn` text NOT NULL,
	`scheme` text NOT NULL,
	`public` integer DEFAULT true NOT NULL,
	`maintenance_mode` integer DEFAULT false NOT NULL,
	`allow_insecure` integer DEFAULT false NOT NULL,
	`behind_proxy` integer DEFAULT false NOT NULL,
	`memory` integer NOT NULL,
	`memory_overallocate` integer DEFAULT 0 NOT NULL,
	`disk` integer NOT NULL,
	`disk_overallocate` integer DEFAULT 0 NOT NULL,
	`upload_size` integer DEFAULT 100 NOT NULL,
	`daemon_base` text NOT NULL,
	`daemon_listen` integer DEFAULT 8080 NOT NULL,
	`daemon_sftp` integer DEFAULT 2022 NOT NULL,
	`token_identifier` text NOT NULL,
	`token_secret` text NOT NULL,
	`api_token` text NOT NULL,
	`location_id` text,
	`last_seen_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wings_nodes_base_url_unique` ON `wings_nodes` (`base_url`);--> statement-breakpoint
CREATE UNIQUE INDEX `wings_nodes_uuid_unique` ON `wings_nodes` (`uuid`);