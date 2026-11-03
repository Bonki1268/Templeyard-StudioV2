CREATE TABLE `ai_assist_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`series_id` text,
	`video_id` text,
	`field` text NOT NULL,
	`user_input` text NOT NULL,
	`suggestion` text NOT NULL,
	`adopted` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `ai_assist_logs_video_idx` ON `ai_assist_logs` (`video_id`);--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`scope` text NOT NULL,
	`shot_key` text,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`tool_calls` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `chat_messages_video_idx` ON `chat_messages` (`video_id`);--> statement-breakpoint
CREATE TABLE `questionnaires` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`answers` text NOT NULL,
	`submitted_at` text,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `questionnaires_video_idx` ON `questionnaires` (`video_id`);