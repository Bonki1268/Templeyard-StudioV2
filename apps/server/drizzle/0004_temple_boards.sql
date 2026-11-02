CREATE TABLE `confirmations` (
	`id` text PRIMARY KEY NOT NULL,
	`video_id` text NOT NULL,
	`point` text NOT NULL,
	`content_ref` text NOT NULL,
	`confirmed_at` text NOT NULL,
	`invalidated_at` text,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `confirmations_video_idx` ON `confirmations` (`video_id`);--> statement-breakpoint
CREATE TABLE `temple_board_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`board_id` text NOT NULL,
	`version` integer NOT NULL,
	`image_model` text NOT NULL,
	`appearance_locks` text NOT NULL,
	`default_lighting` text NOT NULL,
	`confirmed_at` text,
	FOREIGN KEY (`board_id`) REFERENCES `temple_boards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `temple_board_versions_board_version_uq` ON `temple_board_versions` (`board_id`,`version`);--> statement-breakpoint
CREATE TABLE `temple_boards` (
	`id` text PRIMARY KEY NOT NULL,
	`series_id` text NOT NULL,
	`temple_id` text NOT NULL,
	`current_version_id` text,
	FOREIGN KEY (`series_id`) REFERENCES `series`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `temple_boards_series_temple_uq` ON `temple_boards` (`series_id`,`temple_id`);--> statement-breakpoint
CREATE TABLE `temple_views` (
	`id` text PRIMARY KEY NOT NULL,
	`board_version_id` text NOT NULL,
	`view_key` text NOT NULL,
	`view_name` text NOT NULL,
	`source` text NOT NULL,
	`photo_id` text,
	`asset_id` text,
	`confirmed` integer DEFAULT false NOT NULL,
	`created_from_video_id` text,
	FOREIGN KEY (`board_version_id`) REFERENCES `temple_board_versions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`photo_id`) REFERENCES `photos`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_from_video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `temple_views_version_view_uq` ON `temple_views` (`board_version_id`,`view_key`);