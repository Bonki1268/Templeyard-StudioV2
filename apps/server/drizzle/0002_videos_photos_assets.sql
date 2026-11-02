CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`path` text NOT NULL,
	`mime` text NOT NULL,
	`width` integer,
	`height` integer,
	`duration_sec` integer,
	`sha256` text NOT NULL,
	`cloud_ok` integer NOT NULL,
	CONSTRAINT "assets_original_never_cloud" CHECK("assets"."kind" <> 'original_photo' OR "assets"."cloud_ok" = 0)
);
--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`series_id` text NOT NULL,
	`temple_id` text NOT NULL,
	`video_id` text,
	`original_asset_id` text NOT NULL,
	`deidentified_asset_id` text NOT NULL,
	`view_key` text,
	`deid_boxes` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`original_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`deidentified_asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `photos_series_temple_idx` ON `photos` (`series_id`,`temple_id`);--> statement-breakpoint
CREATE TABLE `videos` (
	`id` text PRIMARY KEY NOT NULL,
	`series_id` text NOT NULL,
	`temple_id` text NOT NULL,
	`stage` text NOT NULL,
	`image_model` text NOT NULL,
	`video_model` text NOT NULL,
	`models_locked_at` text,
	`temple_board_version_id` text,
	`one_pass` integer DEFAULT 0 NOT NULL,
	`user_temple_notes` text DEFAULT '' NOT NULL,
	`creative_input` text,
	`cost_limit` integer,
	`copied_from_video_id` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `videos_series_idx` ON `videos` (`series_id`);