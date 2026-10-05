CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_id" text,
	"provider_account_id" text NOT NULL,
	"account_id" text,
	"password" text,
	"refresh_token" text,
	"access_token" text,
	"refresh_token_expires_in" integer,
	"expires_at" timestamp,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	"oauth_token_secret" text,
	"oauth_token" text,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "api_key_metadata" (
	"id" text PRIMARY KEY NOT NULL,
	"api_key_id" text NOT NULL,
	"key_type" integer DEFAULT 1 NOT NULL,
	"allowed_ips" text,
	"memo" text,
	"last_used_at" timestamp,
	"r_servers" integer DEFAULT 0 NOT NULL,
	"r_nodes" integer DEFAULT 0 NOT NULL,
	"r_allocations" integer DEFAULT 0 NOT NULL,
	"r_users" integer DEFAULT 0 NOT NULL,
	"r_locations" integer DEFAULT 0 NOT NULL,
	"r_nests" integer DEFAULT 0 NOT NULL,
	"r_eggs" integer DEFAULT 0 NOT NULL,
	"r_database_hosts" integer DEFAULT 0 NOT NULL,
	"r_server_databases" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "api_key_metadata_api_key_id_unique" UNIQUE("api_key_id")
);
--> statement-breakpoint
CREATE TABLE "apikey" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text,
	"memo" text,
	"name" text,
	"start" text,
	"prefix" text,
	"key" text NOT NULL,
	"user_id" text NOT NULL,
	"refill_interval" integer,
	"refill_amount" integer,
	"last_refill_at" timestamp,
	"last_used_at" timestamp,
	"enabled" boolean DEFAULT true NOT NULL,
	"rate_limit_enabled" boolean DEFAULT true NOT NULL,
	"rate_limit_time_window" integer,
	"rate_limit_max" integer,
	"request_count" integer DEFAULT 0 NOT NULL,
	"remaining" integer,
	"last_request" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"permissions" text,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"actor" text NOT NULL,
	"actor_type" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text,
	"metadata" text,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "database_hosts" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"hostname" text NOT NULL,
	"port" integer DEFAULT 3306 NOT NULL,
	"username" text,
	"password" text,
	"database" text,
	"node_id" text,
	"max_databases" integer,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "egg_variables" (
	"id" text PRIMARY KEY NOT NULL,
	"egg_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"env_variable" text NOT NULL,
	"default_value" text,
	"user_viewable" boolean DEFAULT true NOT NULL,
	"user_editable" boolean DEFAULT true NOT NULL,
	"rules" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eggs" (
	"id" text PRIMARY KEY NOT NULL,
	"uuid" text NOT NULL,
	"nest_id" text NOT NULL,
	"author" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"features" text,
	"file_denylist" text,
	"force_outgoing_ip" boolean DEFAULT false NOT NULL,
	"update_url" text,
	"docker_image" text NOT NULL,
	"docker_images" text,
	"startup" text NOT NULL,
	"config_files" text,
	"config_startup" text,
	"config_stop" text,
	"config_logs" text,
	"script_container" text,
	"script_entry" text,
	"script_install" text,
	"copy_script_from" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "eggs_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE TABLE "email_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"template_id" text NOT NULL,
	"subject" text NOT NULL,
	"html_content" text NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "email_templates_template_id_unique" UNIQUE("template_id")
);
--> statement-breakpoint
CREATE TABLE "jwks" (
	"id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" text PRIMARY KEY NOT NULL,
	"short" text NOT NULL,
	"long" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mount_egg" (
	"mount_id" text NOT NULL,
	"egg_id" text NOT NULL,
	CONSTRAINT "mount_egg_mount_id_egg_id_pk" PRIMARY KEY("mount_id","egg_id")
);
--> statement-breakpoint
CREATE TABLE "mount_node" (
	"mount_id" text NOT NULL,
	"node_id" text NOT NULL,
	CONSTRAINT "mount_node_mount_id_node_id_pk" PRIMARY KEY("mount_id","node_id")
);
--> statement-breakpoint
CREATE TABLE "mount_server" (
	"mount_id" text NOT NULL,
	"server_id" text NOT NULL,
	CONSTRAINT "mount_server_mount_id_server_id_pk" PRIMARY KEY("mount_id","server_id")
);
--> statement-breakpoint
CREATE TABLE "mounts" (
	"id" text PRIMARY KEY NOT NULL,
	"uuid" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source" text NOT NULL,
	"target" text NOT NULL,
	"read_only" boolean DEFAULT false NOT NULL,
	"user_mountable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "mounts_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE TABLE "nests" (
	"id" text PRIMARY KEY NOT NULL,
	"uuid" text NOT NULL,
	"author" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "nests_uuid_unique" UNIQUE("uuid")
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "recovery_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"node_id" text NOT NULL,
	"server_id" text,
	"ip" text NOT NULL,
	"port" integer NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"ip_alias" text,
	"notes" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_backups" (
	"id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"uuid" text NOT NULL,
	"name" text NOT NULL,
	"ignored_files" text,
	"disk" text DEFAULT 'wings' NOT NULL,
	"checksum" text,
	"bytes" integer DEFAULT 0 NOT NULL,
	"is_successful" boolean DEFAULT false NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_databases" (
	"id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"database_host_id" text NOT NULL,
	"name" text NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"remote" text NOT NULL,
	"max_connections" integer,
	"status" text DEFAULT 'ready' NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_startup_env" (
	"id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"description" text,
	"is_editable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_limits" (
	"server_id" text PRIMARY KEY NOT NULL,
	"memory" integer,
	"memory_overallocate" integer,
	"disk" integer,
	"disk_overallocate" integer,
	"swap" integer,
	"io" integer,
	"cpu" integer,
	"threads" text,
	"oom_disabled" boolean DEFAULT true NOT NULL,
	"database_limit" integer,
	"allocation_limit" integer,
	"backup_limit" integer,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_schedule_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"schedule_id" text NOT NULL,
	"sequence_id" integer NOT NULL,
	"action" text NOT NULL,
	"payload" text,
	"time_offset" integer DEFAULT 0 NOT NULL,
	"continue_on_failure" boolean DEFAULT false NOT NULL,
	"is_queued" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"name" text NOT NULL,
	"cron" text NOT NULL,
	"action" text NOT NULL,
	"next_run_at" timestamp,
	"last_run_at" timestamp,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_subusers" (
	"id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"user_id" text NOT NULL,
	"permissions" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "server_transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"old_node" text NOT NULL,
	"new_node" text NOT NULL,
	"old_allocation" text NOT NULL,
	"new_allocation" text NOT NULL,
	"old_additional_allocations" text,
	"new_additional_allocations" text,
	"successful" boolean DEFAULT false NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "servers" (
	"id" text PRIMARY KEY NOT NULL,
	"uuid" text NOT NULL,
	"identifier" text NOT NULL,
	"external_id" text,
	"name" text NOT NULL,
	"description" text,
	"status" text,
	"suspended" boolean DEFAULT false NOT NULL,
	"skip_scripts" boolean DEFAULT false NOT NULL,
	"owner_id" text,
	"node_id" text,
	"allocation_id" text,
	"nest_id" text,
	"egg_id" text,
	"startup" text,
	"image" text,
	"docker_image" text,
	"allocation_limit" integer,
	"database_limit" integer,
	"backup_limit" integer DEFAULT 0 NOT NULL,
	"oom_disabled" boolean DEFAULT true NOT NULL,
	"installed_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_metadata" (
	"session_token" text PRIMARY KEY NOT NULL,
	"first_seen_at" timestamp,
	"last_seen_at" timestamp,
	"ip_address" text,
	"user_agent" text,
	"device_name" text,
	"browser_name" text,
	"os_name" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"session_token" text NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL,
	"expires_at" timestamp,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp,
	"updated_at" timestamp,
	"impersonated_by" text,
	CONSTRAINT "sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ssh_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"fingerprint" text NOT NULL,
	"public_key" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "ssh_keys_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"secret" text,
	"backup_codes" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_username" text,
	"email" text NOT NULL,
	"password" text NOT NULL,
	"name_first" text,
	"name_last" text,
	"language" text DEFAULT 'en' NOT NULL,
	"root_admin" boolean DEFAULT false NOT NULL,
	"role" text DEFAULT 'user' NOT NULL,
	"email_verified" timestamp,
	"image" text,
	"suspended" boolean DEFAULT false NOT NULL,
	"suspended_at" timestamp,
	"suspension_reason" text,
	"password_reset_required" boolean DEFAULT false NOT NULL,
	"banned" boolean,
	"ban_reason" text,
	"ban_expires" timestamp,
	"use_totp" boolean DEFAULT false NOT NULL,
	"totp_secret" text,
	"totp_authenticated_at" timestamp,
	"two_factor_enabled" boolean,
	"remember_token" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"value" text,
	"expires" timestamp NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "wings_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"uuid" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"base_url" text NOT NULL,
	"fqdn" text NOT NULL,
	"scheme" text NOT NULL,
	"public" boolean DEFAULT true NOT NULL,
	"maintenance_mode" boolean DEFAULT false NOT NULL,
	"allow_insecure" boolean DEFAULT false NOT NULL,
	"behind_proxy" boolean DEFAULT false NOT NULL,
	"memory" integer NOT NULL,
	"memory_overallocate" integer DEFAULT 0 NOT NULL,
	"disk" integer NOT NULL,
	"disk_overallocate" integer DEFAULT 0 NOT NULL,
	"upload_size" integer DEFAULT 100 NOT NULL,
	"daemon_base" text NOT NULL,
	"daemon_listen" integer DEFAULT 8080 NOT NULL,
	"daemon_sftp" integer DEFAULT 2022 NOT NULL,
	"token_identifier" text NOT NULL,
	"token_secret" text NOT NULL,
	"api_token" text NOT NULL,
	"location_id" text,
	"last_seen_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_key_metadata" ADD CONSTRAINT "api_key_metadata_api_key_id_apikey_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."apikey"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "apikey" ADD CONSTRAINT "apikey_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "database_hosts" ADD CONSTRAINT "database_hosts_node_id_wings_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."wings_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "egg_variables" ADD CONSTRAINT "egg_variables_egg_id_eggs_id_fk" FOREIGN KEY ("egg_id") REFERENCES "public"."eggs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eggs" ADD CONSTRAINT "eggs_nest_id_nests_id_fk" FOREIGN KEY ("nest_id") REFERENCES "public"."nests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mount_egg" ADD CONSTRAINT "mount_egg_mount_id_mounts_id_fk" FOREIGN KEY ("mount_id") REFERENCES "public"."mounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mount_egg" ADD CONSTRAINT "mount_egg_egg_id_eggs_id_fk" FOREIGN KEY ("egg_id") REFERENCES "public"."eggs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mount_node" ADD CONSTRAINT "mount_node_mount_id_mounts_id_fk" FOREIGN KEY ("mount_id") REFERENCES "public"."mounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mount_node" ADD CONSTRAINT "mount_node_node_id_wings_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."wings_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mount_server" ADD CONSTRAINT "mount_server_mount_id_mounts_id_fk" FOREIGN KEY ("mount_id") REFERENCES "public"."mounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mount_server" ADD CONSTRAINT "mount_server_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recovery_tokens" ADD CONSTRAINT "recovery_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_allocations" ADD CONSTRAINT "server_allocations_node_id_wings_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."wings_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_backups" ADD CONSTRAINT "server_backups_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_databases" ADD CONSTRAINT "server_databases_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_databases" ADD CONSTRAINT "server_databases_database_host_id_database_hosts_id_fk" FOREIGN KEY ("database_host_id") REFERENCES "public"."database_hosts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_startup_env" ADD CONSTRAINT "server_startup_env_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_limits" ADD CONSTRAINT "server_limits_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_schedule_tasks" ADD CONSTRAINT "server_schedule_tasks_schedule_id_server_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."server_schedules"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_schedules" ADD CONSTRAINT "server_schedules_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_subusers" ADD CONSTRAINT "server_subusers_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_subusers" ADD CONSTRAINT "server_subusers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server_transfers" ADD CONSTRAINT "server_transfers_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_node_id_wings_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."wings_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_allocation_id_server_allocations_id_fk" FOREIGN KEY ("allocation_id") REFERENCES "public"."server_allocations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_nest_id_nests_id_fk" FOREIGN KEY ("nest_id") REFERENCES "public"."nests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servers" ADD CONSTRAINT "servers_egg_id_eggs_id_fk" FOREIGN KEY ("egg_id") REFERENCES "public"."eggs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_metadata" ADD CONSTRAINT "session_metadata_session_token_sessions_session_token_fk" FOREIGN KEY ("session_token") REFERENCES "public"."sessions"("session_token") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_impersonated_by_users_id_fk" FOREIGN KEY ("impersonated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ssh_keys" ADD CONSTRAINT "ssh_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wings_nodes" ADD CONSTRAINT "wings_nodes_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_index" ON "accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "accounts_user_id_index" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_key_metadata_api_key_id_index" ON "api_key_metadata" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "api_key_user_id_index" ON "apikey" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_events_occurred_id" ON "audit_events" USING btree ("occurred_at","id");--> statement-breakpoint
CREATE INDEX "audit_events_actor_index" ON "audit_events" USING btree ("actor");--> statement-breakpoint
CREATE INDEX "audit_events_action_index" ON "audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "audit_events_occurred_at_index" ON "audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "email_templates_template_id_index" ON "email_templates" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_short_unique" ON "locations" USING btree ("short");--> statement-breakpoint
CREATE INDEX "rate_limit_key_index" ON "rate_limit" USING btree ("key");--> statement-breakpoint
CREATE INDEX "rate_limit_last_request_index" ON "rate_limit" USING btree ("last_request");--> statement-breakpoint
CREATE UNIQUE INDEX "server_allocations_unique" ON "server_allocations" USING btree ("node_id","ip","port");--> statement-breakpoint
CREATE UNIQUE INDEX "server_backups_uuid_unique" ON "server_backups" USING btree ("uuid");--> statement-breakpoint
CREATE INDEX "server_backups_server_id_index" ON "server_backups" USING btree ("server_id");--> statement-breakpoint
CREATE UNIQUE INDEX "server_databases_unique_name_per_server" ON "server_databases" USING btree ("server_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "server_env_key_unique" ON "server_startup_env" USING btree ("server_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "server_schedule_tasks_sequence" ON "server_schedule_tasks" USING btree ("schedule_id","sequence_id");--> statement-breakpoint
CREATE INDEX "server_schedules_enabled_next_run_index" ON "server_schedules" USING btree ("enabled","next_run_at");--> statement-breakpoint
CREATE INDEX "server_schedules_server_id_index" ON "server_schedules" USING btree ("server_id");--> statement-breakpoint
CREATE UNIQUE INDEX "server_subusers_unique_user_per_server" ON "server_subusers" USING btree ("server_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "servers_uuid_unique" ON "servers" USING btree ("uuid");--> statement-breakpoint
CREATE UNIQUE INDEX "servers_identifier_unique" ON "servers" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "servers_external_id_unique" ON "servers" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "servers_owner_id_index" ON "servers" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "servers_node_id_index" ON "servers" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "servers_status_index" ON "servers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "session_metadata_last_seen_index" ON "session_metadata" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_index" ON "sessions" USING btree ("expires");--> statement-breakpoint
CREATE INDEX "sessions_token_index" ON "sessions" USING btree ("session_token");--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "two_factor_user_id_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_unique" ON "users" USING btree ("username");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_role_index" ON "users" USING btree ("role");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_token_identifier_token_index" ON "verification_tokens" USING btree ("identifier","token");--> statement-breakpoint
CREATE INDEX "verification_tokens_identifier_index" ON "verification_tokens" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "wings_nodes_base_url_unique" ON "wings_nodes" USING btree ("base_url");--> statement-breakpoint
CREATE UNIQUE INDEX "wings_nodes_uuid_unique" ON "wings_nodes" USING btree ("uuid");