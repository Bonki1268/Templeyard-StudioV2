CREATE TABLE `character_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`character_id` text NOT NULL,
	`version` integer NOT NULL,
	`description` text NOT NULL,
	`continuity_locks` text NOT NULL,
	`sheet_asset_id` text,
	`look_asset_id` text,
	`image_model` text NOT NULL,
	`confirmed_at` text,
	FOREIGN KEY (`character_id`) REFERENCES `characters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sheet_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`look_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `character_versions_character_version_uq` ON `character_versions` (`character_id`,`version`);--> statement-breakpoint
CREATE TABLE `characters` (
	`id` text PRIMARY KEY NOT NULL,
	`series_id` text,
	`video_id` text,
	`name` text NOT NULL,
	`is_series` integer DEFAULT false NOT NULL,
	`current_version_id` text,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `characters_series_idx` ON `characters` (`series_id`);--> statement-breakpoint
CREATE INDEX `characters_video_idx` ON `characters` (`video_id`);