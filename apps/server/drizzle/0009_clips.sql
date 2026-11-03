CREATE TABLE `clips` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`shot_key` text NOT NULL,
	`asset_id` text,
	`generation_id` text,
	`selected` integer DEFAULT false NOT NULL,
	`keyframe_similarity` text NOT NULL,
	`based_on` text NOT NULL,
	`needs_reconfirm` integer DEFAULT false NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`generation_id`) REFERENCES `generations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `clips_video_shot_idx` ON `clips` (`video_id`,`shot_key`);--> statement-breakpoint
CREATE TABLE `finals` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`clip_ids` text NOT NULL,
	`subtitle_asset_id` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subtitle_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
