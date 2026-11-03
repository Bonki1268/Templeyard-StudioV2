CREATE TABLE `frames` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`shot_key` text NOT NULL,
	`kind` text NOT NULL,
	`at_sec` real,
	`asset_id` text,
	`generation_id` text,
	`user_uploaded` integer DEFAULT false NOT NULL,
	`edit_of_frame_id` text,
	`selected` integer DEFAULT false NOT NULL,
	`based_on` text NOT NULL,
	`needs_reconfirm` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`generation_id`) REFERENCES `generations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `frames_video_shot_idx` ON `frames` (`video_id`,`shot_key`);