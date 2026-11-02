CREATE TABLE `series` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`visual_style` text NOT NULL,
	`duration_sec` integer NOT NULL,
	`direction` text NOT NULL,
	`default_image_model` text NOT NULL,
	`default_video_model` text NOT NULL,
	`questionnaire_defaults` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
