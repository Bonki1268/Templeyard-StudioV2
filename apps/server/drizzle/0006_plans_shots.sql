CREATE TABLE `plans` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`version` integer NOT NULL,
	`style_note` text NOT NULL,
	`source` text NOT NULL,
	`diff` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `plans_video_version_idx` ON `plans` (`video_id`,`version`);--> statement-breakpoint
CREATE TABLE `shots` (
	`id` text PRIMARY KEY NOT NULL,
	`plan_id` text NOT NULL,
	`shot_key` text NOT NULL,
	`seq` integer NOT NULL,
	`start_sec` integer NOT NULL,
	`duration_sec` integer NOT NULL,
	`shot_size` text NOT NULL,
	`camera_move` text NOT NULL,
	`camera_speed` text NOT NULL,
	`camera_angle` text NOT NULL,
	`description` text NOT NULL,
	`action_start` text NOT NULL,
	`action_end` text NOT NULL,
	`view_key` text NOT NULL,
	`lighting` text NOT NULL,
	`character_ids` text NOT NULL,
	`dialogue` text NOT NULL,
	`speaker` text NOT NULL,
	`subtitle` text NOT NULL,
	`photo_id` text,
	`keyframes_enabled` integer DEFAULT false NOT NULL,
	`keyframe_times` text NOT NULL,
	`custom_prompt` text,
	`fact_sources` text NOT NULL,
	`dialogue_estimate_sec` real,
	FOREIGN KEY (`plan_id`) REFERENCES `plans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `shots_plan_idx` ON `shots` (`plan_id`);--> statement-breakpoint
CREATE INDEX `shots_key_idx` ON `shots` (`shot_key`);