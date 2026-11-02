CREATE TABLE `generations` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text,
	`node` text NOT NULL,
	`target` text NOT NULL,
	`prompt_id_ref` text,
	`prompt_version` integer,
	`mcp_tool` text NOT NULL,
	`model` text NOT NULL,
	`call_config_version` integer,
	`provider_task_id` text,
	`confirm_required` integer DEFAULT false NOT NULL,
	`confirm_message` text,
	`status` text NOT NULL,
	`input` text NOT NULL,
	`user_instruction` text,
	`estimated_cost` integer,
	`reserved_cost` integer DEFAULT 0 NOT NULL,
	`actual_cost` integer,
	`error` text,
	`created_at` text NOT NULL,
	`finished_at` text,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `generations_status_idx` ON `generations` (`status`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text
);
